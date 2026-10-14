import ipaddress
import re
from typing import Dict, List, Optional
from pydantic import BaseModel, Field, field_validator

class NameserverConfig(BaseModel):
    addresses: List[str] = Field(default_factory=list, description="Lista de servidores DNS IPv4")
    search: List[str] = Field(default_factory=list, description="Domínios de busca DNS")

    @field_validator("addresses")
    @classmethod
    def validate_dns_ips(cls, v: List[str]) -> List[str]:
        for ip in v:
            try:
                ipaddress.IPv4Address(ip)
            except ValueError:
                raise ValueError(f"Endereço IP DNS inválido: {ip}")
        return v

class EthernetInterface(BaseModel):
    name: str = Field(..., description="Nome da interface de rede (ex: enp0s3, eth0)")
    dhcp4: bool = Field(default=False, description="Ativar cliente DHCPv4")
    addresses: List[str] = Field(default_factory=list, description="Endereços IP em notação CIDR (ex: 192.168.1.10/24)")
    gateway4: Optional[str] = Field(default=None, description="Gateway padrão IPv4")
    nameservers: Optional[NameserverConfig] = Field(default=None, description="Servidores de nomes")
    mtu: Optional[int] = Field(default=1500, ge=576, le=9000, description="MTU da interface")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_\-\.]+$", v):
            raise ValueError(f"Nome da interface inválido: {v}")
        return v

    @field_validator("addresses")
    @classmethod
    def validate_cidr_addresses(cls, v: List[str]) -> List[str]:
        for addr in v:
            try:
                # strict=False allows host bits to be set, which is what 192.168.1.10/24 is
                ipaddress.IPv4Interface(addr)
            except ValueError:
                raise ValueError(f"Endereço CIDR inválido: '{addr}'. Exemplo válido: 192.168.1.10/24")
        return v

    @field_validator("gateway4")
    @classmethod
    def validate_gateway(cls, v: Optional[str]) -> Optional[str]:
        if v:
            try:
                ipaddress.IPv4Address(v)
            except ValueError:
                raise ValueError(f"Endereço de gateway inválido: '{v}'. Deve ser um IPv4 válido.")
        return v

class NetplanConfig(BaseModel):
    renderer: str = Field(default="networkd", description="Renderer do Netplan: networkd ou NetworkManager")
    ethernets: Dict[str, EthernetInterface] = Field(..., description="Dicionário de interfaces")

    @field_validator("renderer")
    @classmethod
    def validate_renderer(cls, v: str) -> str:
        if v not in ("networkd", "NetworkManager"):
            raise ValueError("Renderer deve ser 'networkd' ou 'NetworkManager'")
        return v
