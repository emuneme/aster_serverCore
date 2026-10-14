import ipaddress
import re
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, field_validator

class DnsBackendType(str, Enum):
    SAMBA_INTERNAL = "SAMBA_INTERNAL"
    BIND9_DLZ = "BIND9_DLZ"

class SambaProvisionRequest(BaseModel):
    realm: str = Field(..., description="Realm Kerberos do AD (ex: EMPRESA.LAN ou CORP.LOCAL)")
    domain: str = Field(..., description="Nome NetBIOS do domínio (ex: EMPRESA)")
    admin_password: str = Field(..., description="Senha do Administrador do Domínio")
    dns_backend: DnsBackendType = Field(default=DnsBackendType.SAMBA_INTERNAL, description="Backend de DNS")
    dns_forwarder: Optional[str] = Field(default="8.8.8.8", description="Servidor DNS forwarder IPv4")
    server_role: str = Field(default="dc", description="Papel do servidor: dc (Domain Controller)")
    force: bool = Field(default=False, description="Forçar o re-provisionamento mesmo se sam.ldb já existir")

    @field_validator("realm")
    @classmethod
    def validate_realm(cls, v: str) -> str:
        v = v.strip().upper()
        if "." not in v:
            raise ValueError(f"Realm inválido: '{v}'. Deve ser um FQDN com pelo menos um ponto (ex: EMPRESA.LAN)")
        
        parts = v.split(".")
        for part in parts:
            if not part or not re.match(r"^[A-Z0-9]([A-Z0-9\-]{0,61}[A-Z0-9])?$", part):
                raise ValueError(f"Segmento '{part}' do Realm não cumpre a convenção DNS.")
        return v

    @field_validator("domain")
    @classmethod
    def validate_domain(cls, v: str) -> str:
        v = v.strip().upper()
        if len(v) < 1 or len(v) > 15:
            raise ValueError(f"Nome NetBIOS do domínio deve ter entre 1 e 15 caracteres (tem {len(v)}).")
        if not re.match(r"^[A-Z0-9\-]+$", v):
            raise ValueError(f"Nome NetBIOS '{v}' contém caracteres inválidos. Apenas letras, números e hífens são permitidos.")
        return v

    @field_validator("admin_password")
    @classmethod
    def validate_samba_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("A senha do administrador do Samba AD deve ter pelo menos 8 caracteres.")
        if not re.search(r"[A-Z]", v):
            raise ValueError("A senha deve conter pelo menos uma letra maiúscula (A-Z).")
        if not re.search(r"[a-z]", v):
            raise ValueError("A senha deve conter pelo menos uma letra minúscula (a-z).")
        if not re.search(r"[0-9]", v):
            raise ValueError("A senha deve conter pelo menos um dígito numérico (0-9).")
        if not re.search(r"[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]", v):
            raise ValueError("A senha deve conter pelo menos um caractere especial (!@#$%^&*...).")
        return v

    @field_validator("dns_forwarder")
    @classmethod
    def validate_forwarder(cls, v: Optional[str]) -> Optional[str]:
        if v:
            try:
                ipaddress.IPv4Address(v)
            except ValueError:
                raise ValueError(f"DNS Forwarder inválido: '{v}'. Deve ser um IPv4 válido.")
        return v

class SambaPreflightResponse(BaseModel):
    can_provision: bool
    sam_ldb_exists: bool
    sam_ldb_path: str
    smb_conf_exists: bool
    smb_conf_path: str
    dns_port_busy: bool
    conflicting_services: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    blockers: list[str] = Field(default_factory=list)

class SambaStatusResponse(BaseModel):
    is_installed: bool
    is_provisioned: bool
    service_active: bool
    service_enabled: bool
    realm: Optional[str] = None
    domain: Optional[str] = None
    role: Optional[str] = None
    dns_backend: Optional[str] = None
    details: Optional[str] = None
