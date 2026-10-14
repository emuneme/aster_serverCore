import ipaddress
from ipaddress import IPv4Address, IPv4Network
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator

class DhcpConfigRequest(BaseModel):
    """
    Schema para requisição de configuração do Kea DHCPv4.
    """
    interface: str = Field(..., description="Interface de rede (ex: eth0)")
    subnet: str = Field(..., description="Sub-rede em formato CIDR (ex: 192.168.1.0/24)")
    pool_start: IPv4Address = Field(..., description="Primeiro IP do pool dinâmico")
    pool_end: IPv4Address = Field(..., description="Último IP do pool dinâmico")
    routers: List[IPv4Address] = Field(default_factory=list, description="Gateways padrão (routers)")
    dns_servers: List[IPv4Address] = Field(
        default_factory=lambda: [IPv4Address("127.0.0.1")], 
        description="Servidores DNS distribuídos aos clientes"
    )
    lease_time: int = Field(
        default=86400, 
        ge=60, 
        description="Tempo de concessão em segundos (padrão: 86400 segundos / 24h)"
    )

    @field_validator("subnet")
    @classmethod
    def validate_subnet_format(cls, v: str) -> str:
        try:
            net = IPv4Network(v, strict=False)
            return str(net)
        except Exception:
            raise ValueError(f"Sub-rede CIDR inválida: '{v}'. Exemplo: 192.168.1.0/24")

    @model_validator(mode="after")
    def validate_pool_and_routers(self) -> "DhcpConfigRequest":
        net = IPv4Network(self.subnet, strict=False)
        
        # 1. Validação se pool_start pertence à sub-rede
        if self.pool_start not in net:
            raise ValueError(f"O IP inicial do pool ({self.pool_start}) não pertence à sub-rede {self.subnet}.")

        # 2. Validação se pool_end pertence à sub-rede
        if self.pool_end not in net:
            raise ValueError(f"O IP final do pool ({self.pool_end}) não pertence à sub-rede {self.subnet}.")

        # 3. Validação se pool_start <= pool_end
        if self.pool_start > self.pool_end:
            raise ValueError(f"O IP inicial do pool ({self.pool_start}) não pode ser maior que o final ({self.pool_end}).")

        # 4. Validação se roteadores pertencem à sub-rede
        for r in self.routers:
            if r not in net:
                raise ValueError(f"O roteador ({r}) não pertence à sub-rede {self.subnet}.")

        return self

class DhcpLeaseInfo(BaseModel):
    """
    Informações de concessão DHCP lidas de /var/lib/kea/kea-leases4.csv
    """
    ip_address: str
    mac_address: str
    hostname: str = "n/a"
    expire_time: Optional[str] = None
    client_id: Optional[str] = None
    valid_lft: Optional[int] = None
    state: str = "ativo"

class DhcpServiceStatus(BaseModel):
    """
    Status do serviço systemd kea-dhcp4-server
    """
    active: bool
    status_text: str
    installed: bool
    config_path: str
    config_exists: bool
    version: Optional[str] = None
    simulation_mode: bool = False


class WizardSetupRequest(BaseModel):
    """
    Schema para requisição do Setup Wizard (Orquestração Unificada de Servidor).
    Sequência contínua: Rede -> Samba AD -> Kea DHCP -> Firewall UFW.
    """
    # Rede
    network_interface: str = Field(..., description="Interface de rede (ex: eth0)")
    server_ip_cidr: str = Field(..., description="Endereço IP com máscara CIDR (ex: 192.168.1.10/24)")
    gateway: Optional[IPv4Address] = Field(default=None, description="Gateway padrão IPv4")
    upstream_dns: List[IPv4Address] = Field(
        default_factory=lambda: [IPv4Address("8.8.8.8"), IPv4Address("1.1.1.1")],
        description="Servidores DNS Upstream (ex: 8.8.8.8, 1.1.1.1)"
    )

    # Samba AD
    realm: str = Field(..., description="Realm Kerberos do AD (ex: EMPRESA.LOCAL)")
    domain: str = Field(..., description="Nome NetBIOS do domínio (ex: EMPRESA)")
    admin_password: str = Field(..., description="Senha do Administrador do Samba AD")

    # DHCP
    enable_dhcp: bool = Field(default=True, description="Habilitar servidor Kea DHCP")
    dhcp_pool_start: Optional[IPv4Address] = Field(default=None, description="Primeiro IP do pool dinâmico")
    dhcp_pool_end: Optional[IPv4Address] = Field(default=None, description="Último IP do pool dinâmico")
    lease_time: int = Field(default=86400, ge=60, description="Tempo de concessão DHCP em segundos")

    # Firewall
    enable_firewall: bool = Field(default=True, description="Habilitar Firewall UFW")
    allow_ssh: bool = Field(default=True, description="Garantir liberação da porta SSH (22/tcp)")

    @field_validator("server_ip_cidr")
    @classmethod
    def validate_server_ip_cidr(cls, v: str) -> str:
        v = v.strip()
        if "/" not in v:
            raise ValueError(f"O IP deve incluir a máscara CIDR (ex: 192.168.1.10/24). Recebido: '{v}'")
        try:
            iface = ipaddress.IPv4Interface(v)
            return str(iface)
        except Exception:
            raise ValueError(f"Formato CIDR inválido: '{v}'. Exemplo: 192.168.1.10/24")

    @field_validator("realm")
    @classmethod
    def validate_realm(cls, v: str) -> str:
        import re
        v = v.strip().upper()
        if "." not in v:
            raise ValueError(f"Realm inválido: '{v}'. Deve ser um FQDN com pelo menos um ponto (ex: EMPRESA.LOCAL)")
        parts = v.split(".")
        for part in parts:
            if not part or not re.match(r"^[A-Z0-9]([A-Z0-9\-]{0,61}[A-Z0-9])?$", part):
                raise ValueError(f"Segmento '{part}' do Realm não cumpre a convenção DNS.")
        return v

    @field_validator("domain")
    @classmethod
    def validate_domain(cls, v: str) -> str:
        import re
        v = v.strip().upper()
        if len(v) < 1 or len(v) > 15:
            raise ValueError(f"Nome NetBIOS do domínio deve ter entre 1 e 15 caracteres (tem {len(v)}).")
        if not re.match(r"^[A-Z0-9\-]+$", v):
            raise ValueError(f"Nome NetBIOS '{v}' contém caracteres inválidos. Apenas letras, números e hífens são permitidos.")
        return v

    @field_validator("admin_password")
    @classmethod
    def validate_admin_password(cls, v: str) -> str:
        import re
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

    @field_validator("allow_ssh")
    @classmethod
    def force_allow_ssh(cls, v: bool) -> bool:
        return True

    @model_validator(mode="after")
    def validate_wizard_dependencies(self) -> "WizardSetupRequest":
        iface = ipaddress.IPv4Interface(self.server_ip_cidr)
        net = iface.network

        if self.gateway and self.gateway not in net:
            raise ValueError(f"O gateway configurado ({self.gateway}) não pertence à sub-rede da interface ({net}).")

        if self.enable_dhcp:
            if not self.dhcp_pool_start:
                raise ValueError("O início do pool DHCP (dhcp_pool_start) é obrigatório quando o DHCP está ativado.")
            if not self.dhcp_pool_end:
                raise ValueError("O fim do pool DHCP (dhcp_pool_end) é obrigatório quando o DHCP está ativado.")

            if self.dhcp_pool_start not in net:
                raise ValueError(f"O IP inicial do pool DHCP ({self.dhcp_pool_start}) não pertence à sub-rede {net}.")
            if self.dhcp_pool_end not in net:
                raise ValueError(f"O IP final do pool DHCP ({self.dhcp_pool_end}) não pertence à sub-rede {net}.")
            if self.dhcp_pool_start > self.dhcp_pool_end:
                raise ValueError(f"O IP inicial do pool ({self.dhcp_pool_start}) não pode ser maior que o final ({self.dhcp_pool_end}).")

        return self


# ==============================================================================
# SCHEMAS DE AUTENTICAÇÃO E SESSÃO (HÍBRIDA: UBUNTU PAM + SGLINUX ADMIN)
# ==============================================================================

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64, description="Nome de utilizador (Ubuntu ou SGLinux)")
    password: str = Field(..., min_length=1, description="Senha do utilizador")
    remember_me: bool = Field(default=False, description="Manter sessão iniciada por tempo prolongado")


class UserInfo(BaseModel):
    username: str
    auth_type: str = Field(..., description="'pam' para utilizador Ubuntu ou 'local' para admin SGLinux")
    role: str = Field(default="admin", description="Papel administrativo do utilizador")
    display_name: str
    is_sudo: bool = True


class ServerAuthInfo(BaseModel):
    hostname: str
    os_name: str
    is_production: bool
    server_ip: Optional[str] = None
    version: str = "1.0.0"


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="Tempo de expiração do token em segundos")
    user_info: UserInfo
    server_info: ServerAuthInfo


# ==============================================================================
# SCHEMAS DE MONITORIZAÇÃO EM TEMPO REAL (TELEMETRIA E SERVIÇOS)
# ==============================================================================

class CpuMetrics(BaseModel):
    usage_percent: float = Field(..., description="Percentagem total de uso da CPU (0-100%)")
    cores_logical: int
    cores_physical: int
    load_avg: List[float] = Field(..., description="Load average dos últimos 1, 5 e 15 minutos")


class MemoryMetrics(BaseModel):
    total_bytes: int
    used_bytes: int
    available_bytes: int
    usage_percent: float


class SwapMetrics(BaseModel):
    total_bytes: int
    used_bytes: int
    free_bytes: int
    usage_percent: float


class DiskPartitionMetrics(BaseModel):
    mountpoint: str
    total_bytes: int
    used_bytes: int
    free_bytes: int
    usage_percent: float


class NetworkRateItem(BaseModel):
    interface: str
    bytes_sent_per_sec: float
    bytes_recv_per_sec: float
    total_sent_bytes: int
    total_recv_bytes: int


class NetworkIoMetrics(BaseModel):
    total_sent_per_sec: float
    total_recv_per_sec: float
    interfaces: List[NetworkRateItem] = Field(default_factory=list)


class ServiceStatusItem(BaseModel):
    name: str
    display_name: str
    description: str
    active: bool
    status_text: str
    port: Optional[int] = None
    port_open: Optional[bool] = None


class UptimeInfo(BaseModel):
    uptime_seconds: int
    formatted: str
    hostname: str
    fqdn: str


class SystemMonitorPayload(BaseModel):
    timestamp: str
    cpu: CpuMetrics
    memory: MemoryMetrics
    swap: SwapMetrics
    disks: List[DiskPartitionMetrics]
    network_io: NetworkIoMetrics
    uptime: UptimeInfo
    services: List[ServiceStatusItem]
    dns_port_53_open: bool
    simulation_mode: bool = False


class ServiceActionResponse(BaseModel):
    service: str
    action: str
    success: bool
    status_text: str
    active: bool
    message: str


class ServiceLogsResponse(BaseModel):
    service: str
    lines: List[str]
    count: int

