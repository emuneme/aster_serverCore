import os
import platform
import shutil
import time
from typing import Any, Dict, List
import psutil
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.executor import executor

router = APIRouter(prefix="/system", tags=["System & Infrastructure Overview"])

class PackageInstallRequest(BaseModel):
    packages: List[str] = Field(..., description="Lista de pacotes a instalar via apt (ex: ['samba', 'winbind', 'smbclient', 'bind9'])")

@router.get("/info")
def get_system_info() -> Dict[str, Any]:
    """
    Retorna métricas de saúde e informações de hardware/SO do servidor.
    """
    boot_time = psutil.boot_time()
    uptime_seconds = int(time.time() - boot_time)

    # Memory
    mem = psutil.virtual_memory()
    
    # Disk root
    disk = psutil.disk_usage("/")

    # CPU
    cpu_percent = psutil.cpu_percent(interval=None)

    return {
        "hostname": platform.node(),
        "system": platform.system(),
        "release": platform.release(),
        "version": platform.version(),
        "architecture": platform.machine(),
        "uptime_seconds": uptime_seconds,
        "cpu": {
            "cores_logical": psutil.cpu_count(logical=True),
            "cores_physical": psutil.cpu_count(logical=False),
            "usage_percent": cpu_percent
        },
        "memory": {
            "total_bytes": mem.total,
            "used_bytes": mem.used,
            "available_bytes": mem.available,
            "usage_percent": mem.percent
        },
        "disk": {
            "total_bytes": disk.total,
            "used_bytes": disk.used,
            "free_bytes": disk.free,
            "usage_percent": disk.percent
        },
        "simulation_mode": settings.SIMULATION_MODE,
        "is_root": os.geteuid() == 0 if hasattr(os, "geteuid") else False
    }

@router.get("/services")
def get_services_status() -> List[Dict[str, Any]]:
    """
    Retorna o status de execução dos principais daemons de infraestrutura.
    """
    tracked_services = [
        {"name": "samba-ad-dc", "description": "Samba 4 Active Directory Domain Controller", "port": 389},
        {"name": "bind9", "description": "Servidor DNS BIND9", "port": 53},
        {"name": "kea-dhcp4-server", "description": "Servidor DHCP Kea", "port": 67},
        {"name": "dnsmasq", "description": "Servidor DNS/DHCP Dnsmasq", "port": 53},
        {"name": "ufw", "description": "Firewall UFW", "port": None}
    ]

    results = []
    for svc in tracked_services:
        # In simulation mode, mock active states
        if settings.SIMULATION_MODE:
            results.append({
                **svc,
                "active": True,
                "enabled": True,
                "status_text": "active (running)"
            })
        else:
            # Query systemctl
            active = False
            enabled = False
            status_text = "unknown"
            try:
                res = os.system(f"systemctl is-active --quiet {svc['name']}")
                active = (res == 0)
                res_en = os.system(f"systemctl is-enabled --quiet {svc['name']}")
                enabled = (res_en == 0)
                status_text = "active (running)" if active else "inactive (dead)"
            except Exception:
                pass

            results.append({
                **svc,
                "active": active,
                "enabled": enabled,
                "status_text": status_text
            })

    return results

@router.post("/packages/install")
def install_system_packages(req: PackageInstallRequest):
    """
    Instala pacotes do sistema via apt-get em uma tarefa assíncrona com streaming de logs em tempo real.
    """
    if not req.packages:
        raise HTTPException(status_code=400, detail="Nenhum pacote especificado.")

    # Sanitize package names (letters, numbers, hyphens, plus, dots)
    sanitized = []
    for pkg in req.packages:
        pkg = pkg.strip()
        if not pkg.replace("-", "").replace("+", "").replace(".", "").replace("_", "").isalnum():
            raise HTTPException(status_code=400, detail=f"Nome de pacote inválido: '{pkg}'")
        sanitized.append(pkg)

    cmd_args = ["apt-get", "install", "-y"] + sanitized

    task = executor.run_command(
        command=cmd_args,
        description=f"Instalação de pacotes via apt: {' '.join(sanitized)}"
    )

    return {
        "message": "Instalação de pacotes iniciada em segundo plano",
        "task_id": task.id,
        "packages": sanitized,
        "log_file": task.log_file
    }
