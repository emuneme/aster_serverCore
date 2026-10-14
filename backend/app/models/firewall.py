import ipaddress
import re
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator

class UfwAction(str, Enum):
    ALLOW = "allow"
    DENY = "deny"
    REJECT = "reject"
    LIMIT = "limit"

class UfwProtocol(str, Enum):
    TCP = "tcp"
    UDP = "udp"
    ANY = "any"

class UfwDirection(str, Enum):
    IN = "in"
    OUT = "out"

class UfwRuleCreate(BaseModel):
    action: UfwAction = Field(default=UfwAction.ALLOW, description="Ação da regra: allow, deny, reject, limit")
    port: str = Field(..., description="Porta, intervalo (ex: 49152:65535) ou serviço")
    protocol: UfwProtocol = Field(default=UfwProtocol.TCP, description="Protocolo: tcp, udp, any")
    direction: UfwDirection = Field(default=UfwDirection.IN, description="Direção do tráfego: in, out")
    from_ip: Optional[str] = Field(default=None, description="IP ou sub-rede de origem (opcional)")
    to_ip: Optional[str] = Field(default=None, description="IP ou sub-rede de destino (opcional)")
    comment: Optional[str] = Field(default=None, max_length=64, description="Comentário descritivo da regra")

    @field_validator("port")
    @classmethod
    def validate_port_spec(cls, v: str) -> str:
        v = v.strip()
        # Single port
        if v.isdigit():
            port_num = int(v)
            if not (1 <= port_num <= 65535):
                raise ValueError(f"Porta {port_num} fora do intervalo válido (1-65535).")
            return v
        # Port range (e.g. 80:443, 49152:65535)
        if ":" in v:
            parts = v.split(":")
            if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                p1, p2 = int(parts[0]), int(parts[1])
                if 1 <= p1 <= 65535 and 1 <= p2 <= 65535 and p1 <= p2:
                    return v
            raise ValueError(f"Intervalo de portas inválido: '{v}'. Use formato inicio:fim (ex: 49152:65535).")
        # Named service (e.g., ssh, samba, dns)
        if re.match(r"^[a-zA-Z0-9_\-]+$", v):
            return v
        raise ValueError(f"Especificação de porta inválida: '{v}'")

    @field_validator("from_ip", "to_ip")
    @classmethod
    def validate_optional_ip_or_cidr(cls, v: Optional[str]) -> Optional[str]:
        if not v or v.lower() == "any":
            return None
        try:
            # Check if valid IP or CIDR
            ipaddress.IPv4Network(v, strict=False)
            return v
        except ValueError:
            raise ValueError(f"IP ou sub-rede inválida: '{v}'. Use formato IPv4 ou CIDR.")

class UfwRuleItem(BaseModel):
    index: int
    to: str
    action: str
    from_ip: str
    comment: Optional[str] = None

class UfwStatus(BaseModel):
    active: bool
    default_incoming: str = "deny"
    default_outgoing: str = "allow"
    rules: List[UfwRuleItem] = Field(default_factory=list)

class FirewallToggleRequest(BaseModel):
    enabled: Optional[bool] = Field(default=None, description="True para ativar, False para desativar, ou null para alternar estado atual")

class FirewallProfileApplyRequest(BaseModel):
    profiles: List[str] = Field(..., description="Lista de chaves de perfis a aplicar (ex: ['ssh', 'samba_ad', 'dns', 'dhcp'])")

class FirewallProfileInfo(BaseModel):
    key: str
    name: str
    description: str
    ports: List[str]

class NatConfigRequest(BaseModel):
    enabled: bool = Field(default=True, description="Ativar ou desativar NAT/Masquerade")
    wan_interface: str = Field(..., description="Interface de saída com acesso à Internet / WAN (ex: eth0)")
    lan_interface: str = Field(..., description="Interface interna da rede local / LAN (ex: eth1)")
    lan_subnet: Optional[str] = Field(default=None, description="Sub-rede interna opcional para Masquerade (ex: 192.168.1.0/24)")

    @field_validator("lan_subnet")
    @classmethod
    def validate_lan_subnet(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        v = v.strip()
        try:
            ipaddress.IPv4Network(v, strict=False)
            return v
        except Exception:
            raise ValueError(f"Sub-rede LAN inválida: '{v}'. Use formato CIDR (ex: 192.168.1.0/24).")

class NatStatusResponse(BaseModel):
    enabled: bool
    ip_forwarding: bool
    wan_interface: Optional[str] = None
    lan_interface: Optional[str] = None
    lan_subnet: Optional[str] = None
    details: Optional[str] = None

