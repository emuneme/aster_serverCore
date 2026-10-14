import os
import sys
from pathlib import Path
from typing import List

class Settings:
    PROJECT_NAME: str = "SGLinux - Infra Manager"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    
    # Check if running in Linux as root or if simulation forced
    is_linux = sys.platform.startswith("linux")
    is_root = os.geteuid() == 0 if hasattr(os, "geteuid") else False
    
    # Environment variable override SGLINUX_SIMULATION="true"/"false"
    env_sim = os.getenv("SGLINUX_SIMULATION")
    if env_sim is not None:
        SIMULATION_MODE: bool = env_sim.lower() in ("1", "true", "yes")
    else:
        # Default to simulation mode if not on Linux or not running as root
        SIMULATION_MODE: bool = not (is_linux and is_root)

    # Authentication & JWT Security Settings
    SECRET_KEY: str = os.getenv("SGLINUX_SECRET_KEY", "sglinux-infrastructure-jwt-secret-key-2026-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("SGLINUX_TOKEN_EXPIRE_MINUTES", "480"))  # 8 hours default
    REMEMBER_ME_EXPIRE_DAYS: int = int(os.getenv("SGLINUX_REMEMBER_EXPIRE_DAYS", "30"))      # 30 days if remember_me
    ADMIN_USER: str = os.getenv("SGLINUX_ADMIN_USER", "admin")
    ADMIN_PASSWORD: str = os.getenv("SGLINUX_ADMIN_PASSWORD", "SGLinux@Admin2026!")

    # Base storage directory for simulation mode / temporary files
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent.parent.parent
    MOCK_ETC_DIR: Path = BASE_DIR / "data" / "mock_etc"
    
    # Service Configuration Paths (use mock directory in simulation mode, else /etc)
    @property
    def NETPLAN_FILE(self) -> Path:
        if self.SIMULATION_MODE:
            p = self.MOCK_ETC_DIR / "netplan" / "01-netcfg.yaml"
            p.parent.mkdir(parents=True, exist_ok=True)
            return p
        return Path("/etc/netplan/01-netcfg.yaml")

    @property
    def SAMBA_CONF_FILE(self) -> Path:
        if self.SIMULATION_MODE:
            p = self.MOCK_ETC_DIR / "samba" / "smb.conf"
            p.parent.mkdir(parents=True, exist_ok=True)
            return p
        return Path("/etc/samba/smb.conf")

    @property
    def KEA_CONF_FILE(self) -> Path:
        if self.SIMULATION_MODE:
            p = self.MOCK_ETC_DIR / "kea" / "kea-dhcp4.conf"
            p.parent.mkdir(parents=True, exist_ok=True)
            return p
        return Path("/etc/kea/kea-dhcp4.conf")

    @property
    def DNSMASQ_CONF_FILE(self) -> Path:
        if self.SIMULATION_MODE:
            p = self.MOCK_ETC_DIR / "dnsmasq.d" / "sglinux-dhcp.conf"
            p.parent.mkdir(parents=True, exist_ok=True)
            return p
        return Path("/etc/dnsmasq.d/sglinux-dhcp.conf")

    @property
    def LOG_DIR(self) -> Path:
        """
        Diretório para ficheiros dedicados de auditoria e resolução de problemas.
        Usa /var/log/sysmanager em produção ou fallback no diretório data/logs.
        """
        if not self.SIMULATION_MODE and self.is_root:
            target = Path("/var/log/sysmanager")
            try:
                target.mkdir(parents=True, exist_ok=True)
                return target
            except Exception:
                pass
        fallback = self.BASE_DIR / "data" / "logs"
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback

    @property
    def SAMBA_SAM_LDB(self) -> Path:
        if self.SIMULATION_MODE:
            p = self.MOCK_ETC_DIR / "samba" / "private" / "sam.ldb"
            p.parent.mkdir(parents=True, exist_ok=True)
            return p
        return Path("/var/lib/samba/private/sam.ldb")

    @property
    def SAMBA_SECRETS_LDB(self) -> Path:
        if self.SIMULATION_MODE:
            p = self.MOCK_ETC_DIR / "samba" / "private" / "secrets.ldb"
            p.parent.mkdir(parents=True, exist_ok=True)
            return p
        return Path("/var/lib/samba/private/secrets.ldb")

    @property
    def BIND9_OPTIONS_FILE(self) -> Path:
        if self.SIMULATION_MODE:
            p = self.MOCK_ETC_DIR / "bind" / "named.conf.options"
            p.parent.mkdir(parents=True, exist_ok=True)
            return p
        return Path("/etc/bind/named.conf.options")

    @property
    def UFW_BEFORE_RULES(self) -> Path:
        if self.SIMULATION_MODE:
            p = self.MOCK_ETC_DIR / "ufw" / "before.rules"
            p.parent.mkdir(parents=True, exist_ok=True)
            return p
        return Path("/etc/ufw/before.rules")

    @property
    def UFW_DEFAULT_CONFIG(self) -> Path:
        if self.SIMULATION_MODE:
            p = self.MOCK_ETC_DIR / "default" / "ufw"
            p.parent.mkdir(parents=True, exist_ok=True)
            return p
        return Path("/etc/default/ufw")

    @property
    def SYSCTL_IP_FORWARD_CONF(self) -> Path:
        if self.SIMULATION_MODE:
            p = self.MOCK_ETC_DIR / "sysctl.d" / "99-ip-forward.conf"
            p.parent.mkdir(parents=True, exist_ok=True)
            return p
        return Path("/etc/sysctl.d/99-ip-forward.conf")


    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "*"
    ]

settings = Settings()
