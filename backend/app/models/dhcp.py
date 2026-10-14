import ipaddress
import re
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator

class DhcpBackendType(str, Enum):
    KEA = "kea"
    DNSMASQ = "dnsmasq"

class DhcpReservation(BaseModel):
    hostname: Optional[str] = Field(default=None, description="Nome do host associado")
    mac_address: str = Field(..., description="Endereço MAC (ex: 00:11:22:33:44:55)")
    ip_address: str = Field(..., description="Endereço IPv4 reservado")

    @field_validator("mac_address")
    @classmethod
    def validate_mac(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(r"^([0-9a-f]{2}[:-]){5}([0-9a-f]{2})$", v):
            raise ValueError(f"Endereço MAC inválido: '{v}'. Formato esperado: aa:bb:cc:dd:ee:ff")
        # Normalize to colon-separated
        return v.replace("-", ":")

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, v: str) -> str:
        try:
            ipaddress.IPv4Address(v)
        except ValueError:
            raise ValueError(f"Endereço IP inválido na reserva: '{v}'")
        return v

class DhcpSubnetConfig(BaseModel):
    subnet: str = Field(..., description="Rede em formato CIDR (ex: 192.168.1.0/24)")
    pool_start: str = Field(..., description="Primeiro IP do pool (ex: 192.168.1.100)")
    pool_end: str = Field(..., description="Último IP do pool (ex: 192.168.1.200)")
    gateway: Optional[str] = Field(default=None, description="Gateway para os clientes DHCP")
    dns_servers: List[str] = Field(default_factory=list, description="Servidores DNS distribuídos")
    domain_name: Optional[str] = Field(default=None, description="Sufixo de domínio local")
    lease_time: Optional[str] = Field(default="12h", description="Tempo de concessão (ex: 12h, 86400)")
    reservations: List[DhcpReservation] = Field(default_factory=list, description="Reservas estáticas")

    @field_validator("subnet")
    @classmethod
    def validate_subnet(cls, v: str) -> str:
        try:
            net = ipaddress.IPv4Network(v, strict=False)
            return str(net)
        except ValueError:
            raise ValueError(f"Sub-rede CIDR inválida: '{v}'. Exemplo: 192.168.1.0/24")

    @field_validator("pool_start", "pool_end")
    @classmethod
    def validate_pool_ips(cls, v: str) -> str:
        try:
            ipaddress.IPv4Address(v)
        except ValueError:
            raise ValueError(f"Endereço IP de pool inválido: '{v}'")
        return v

    @field_validator("dns_servers")
    @classmethod
    def validate_dns_list(cls, v: List[str]) -> List[str]:
        for ip in v:
            try:
                ipaddress.IPv4Address(ip)
            except ValueError:
                raise ValueError(f"DNS Server IPv4 inválido: '{ip}'")
        return v

    @model_validator(mode="after")
    def validate_pool_range(self) -> "DhcpSubnetConfig":
        net = ipaddress.IPv4Network(self.subnet, strict=False)
        start_ip = ipaddress.IPv4Address(self.pool_start)
        end_ip = ipaddress.IPv4Address(self.pool_end)

        if start_ip not in net:
            raise ValueError(f"O IP inicial do pool ({start_ip}) não pertence à sub-rede {net}.")
        if end_ip not in net:
            raise ValueError(f"O IP final do pool ({end_ip}) não pertence à sub-rede {net}.")
        if start_ip > end_ip:
            raise ValueError(f"O IP inicial ({start_ip}) não pode ser maior que o final ({end_ip}).")
        
        if self.gateway:
            gw_ip = ipaddress.IPv4Address(self.gateway)
            if gw_ip not in net:
                raise ValueError(f"O Gateway ({gw_ip}) não pertence à sub-rede {net}.")

        for res in self.reservations:
            res_ip = ipaddress.IPv4Address(res.ip_address)
            if res_ip not in net:
                raise ValueError(f"O IP da reserva {res.hostname or res.mac_address} ({res_ip}) não pertence à sub-rede {net}.")

        return self

    @property
    def subnet_mask(self) -> str:
        net = ipaddress.IPv4Network(self.subnet, strict=False)
        return str(net.netmask)

class DhcpConfig(BaseModel):
    backend: DhcpBackendType = Field(default=DhcpBackendType.KEA, description="Serviço backend DHCP")
    interface: Optional[str] = Field(default=None, description="Interface de rede (opcional, ou * para todas)")
    domain: Optional[str] = Field(default=None, description="Domínio global")
    subnets: List[DhcpSubnetConfig] = Field(..., description="Lista de sub-redes ativas")

# Reexportação para compatibilidade
from app.schemas import DhcpConfigRequest, DhcpLeaseInfo, DhcpServiceStatus
