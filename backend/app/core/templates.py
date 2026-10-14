import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import settings
from app.models.network import NetplanConfig
from app.models.samba import SambaProvisionRequest
from app.models.dhcp import DhcpConfig

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"

jinja_env = Environment(
    loader=FileSystemLoader(str(TEMPLATE_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
    trim_blocks=True,
    lstrip_blocks=True,
)

def render_netplan(config: NetplanConfig) -> str:
    template = jinja_env.get_template("netplan.yaml.j2")
    return template.render(
        renderer=config.renderer,
        ethernets=config.ethernets
    )

def render_samba(config: SambaProvisionRequest) -> str:
    template = jinja_env.get_template("smb.conf.j2")
    return template.render(
        realm=config.realm,
        domain=config.domain,
        dns_backend=config.dns_backend.value,
        dns_forwarder=config.dns_forwarder,
    )

def render_kea(config: DhcpConfig) -> str:
    template = jinja_env.get_template("kea-dhcp4.conf.j2")
    return template.render(
        interface=config.interface or "*",
        subnets=config.subnets
    )

def render_dnsmasq(config: DhcpConfig) -> str:
    template = jinja_env.get_template("dnsmasq.conf.j2")
    return template.render(
        interface=config.interface,
        domain=config.domain,
        subnets=config.subnets
    )

def render_bind9(forwarders: List[str]) -> str:
    template = jinja_env.get_template("named.conf.options.j2")
    return template.render(forwarders=forwarders)

def write_and_backup(dest_path: Path, content: str) -> None:
    """
    Safely writes content to dest_path, creating directories and an optional timestamped backup.
    """
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    if dest_path.exists():
        backup_file = dest_path.with_suffix(f"{dest_path.suffix}.bak-{datetime.now().strftime('%Y%m%d%H%M%S')}")
        try:
            shutil.copy2(dest_path, backup_file)
        except Exception:
            pass
    
    with open(dest_path, "w", encoding="utf-8") as f:
        f.write(content)
