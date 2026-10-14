import os
import shutil
import socket
from pathlib import Path
from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.core.executor import executor
from app.core.templates import render_samba, write_and_backup
from app.models.samba import SambaPreflightResponse, SambaProvisionRequest, SambaStatusResponse

router = APIRouter(prefix="/samba", tags=["Samba 4 Active Directory"])

def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    """Verifica se uma porta de rede já está em uso por outro serviço."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0

@router.get("/preflight", response_model=SambaPreflightResponse)
def check_samba_preflight():
    """
    Verificação rigorosa de estado prévio antes do provisionamento:
    - Existência de /var/lib/samba/private/sam.ldb e secrets.ldb
    - Ficheiro smb.conf pré-existente
    - Conflitos de portas e serviços DNS
    """
    sam_path = settings.SAMBA_SAM_LDB
    conf_path = settings.SAMBA_CONF_FILE

    sam_exists = sam_path.exists()
    conf_exists = conf_path.exists()

    dns_busy = False
    if not settings.SIMULATION_MODE:
        dns_busy = is_port_in_use(53)

    conflicting_services = []
    warnings = []
    blockers = []

    if sam_exists:
        blockers.append(
            f"Base de dados Active Directory pré-existente detectada em {sam_path}. "
            "Provisionar novamente sem a opção 'force' corromperá a instalação."
        )

    if conf_exists:
        warnings.append(
            f"Arquivo smb.conf existente em {conf_path}. "
            "Será gerado backup automático antes de qualquer sobreposição."
        )

    if dns_busy:
        warnings.append(
            "Porta 53 (DNS) atualmente em uso. Certifique-se de desativar o systemd-resolved "
            "ou configurar o backend DNS compatível."
        )

    can_provision = len(blockers) == 0

    return SambaPreflightResponse(
        can_provision=can_provision,
        sam_ldb_exists=sam_exists,
        sam_ldb_path=str(sam_path),
        smb_conf_exists=conf_exists,
        smb_conf_path=str(conf_path),
        dns_port_busy=dns_busy,
        conflicting_services=conflicting_services,
        warnings=warnings,
        blockers=blockers
    )

@router.get("/status", response_model=SambaStatusResponse)
def get_samba_status():
    """
    Verifica o estado atual de instalação e provisionamento do Samba 4 AD DC.
    """
    conf_path = settings.SAMBA_CONF_FILE
    has_conf = conf_path.exists()
    sam_path = settings.SAMBA_SAM_LDB
    has_sam = sam_path.exists()

    samba_tool_path = shutil.which("samba-tool")
    is_installed = samba_tool_path is not None or settings.SIMULATION_MODE

    realm = None
    domain = None
    dns_backend = "SAMBA_INTERNAL"

    if has_conf:
        try:
            content = conf_path.read_text(encoding="utf-8")
            for line in content.splitlines():
                line = line.strip()
                if line.startswith("realm"):
                    parts = line.split("=", 1)
                    if len(parts) == 2:
                        realm = parts[1].strip()
                elif line.startswith("workgroup"):
                    parts = line.split("=", 1)
                    if len(parts) == 2:
                        domain = parts[1].strip()
                elif line.startswith("server services") and "-dns" in line:
                    dns_backend = "BIND9_DLZ"
        except Exception:
            pass

    is_provisioned = (has_conf and has_sam) or (has_conf and realm is not None) or (settings.SIMULATION_MODE and has_conf)

    return SambaStatusResponse(
        is_installed=is_installed,
        is_provisioned=is_provisioned,
        service_active=settings.SIMULATION_MODE or False,
        service_enabled=settings.SIMULATION_MODE or False,
        realm=realm or ("CORP.LOCAL" if settings.SIMULATION_MODE else None),
        domain=domain or ("CORP" if settings.SIMULATION_MODE else None),
        role="Active Directory Domain Controller",
        dns_backend=dns_backend,
        details="Ambiente pronto para gestão" if is_installed else "Samba não detectado no PATH do sistema"
    )

@router.post("/preview")
def preview_smb_conf(request: SambaProvisionRequest):
    """
    Renderiza uma prévia do arquivo smb.conf para validação antes do provisionamento.
    """
    try:
        content = render_samba(request)
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao gerar smb.conf: {str(e)}")

@router.post("/provision")
def provision_samba_ad_dc(request: SambaProvisionRequest):
    """
    Inicia a tarefa assíncrona de provisionamento do Samba 4 AD DC.
    Verifica estado prévio (ex: sam.ldb) e passa lista de argumentos para subprocess_exec.
    """
    sam_path = settings.SAMBA_SAM_LDB
    # Checagem de estado prévio estrita
    if sam_path.exists() and not request.force:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Estado prévio detectado: O Samba 4 AD DC já se encontra provisionado "
                f"neste servidor ({sam_path} já existe). Para re-provisionar e sobrescrever, "
                f"utilize 'force: true' após efetuar backup das bases anteriores."
            )
        )

    # Construir lista segura de argumentos para subprocess_exec
    dns_arg = "SAMBA_INTERNAL" if request.dns_backend.value == "SAMBA_INTERNAL" else "BIND9_DLZ"
    
    cmd_args = [
        "samba-tool",
        "domain",
        "provision",
        f"--realm={request.realm}",
        f"--domain={request.domain}",
        f"--adminpass={request.admin_password}",
        "--server-role=dc",
        f"--dns-backend={dns_arg}",
        "--use-rfc2307"
    ]
    if request.dns_forwarder:
        cmd_args.append(f"--dns-forwarder={request.dns_forwarder}")

    # Gravar arquivo de configuração em modo simulação
    if settings.SIMULATION_MODE:
        conf_content = render_samba(request)
        write_and_backup(settings.SAMBA_CONF_FILE, conf_content)
        # Criar mock do sam.ldb se ainda não existir
        sam_path.parent.mkdir(parents=True, exist_ok=True)
        sam_path.write_text("# Mock SAM database for SGLinux\n", encoding="utf-8")

    task = executor.run_command(
        command=cmd_args,
        description=f"Provisionamento seguro do Samba 4 AD DC ({request.realm})"
    )

    return {
        "message": "Tarefa de provisionamento iniciada com sucesso",
        "task_id": task.id,
        "realm": request.realm,
        "domain": request.domain,
        "log_file": task.log_file,
        "command_args": cmd_args
    }

@router.post("/service/{action}")
def control_samba_service(action: str):
    """
    Controla o serviço samba-ad-dc (start, stop, restart, enable, disable).
    Passa argumentos como lista para subprocess_exec.
    """
    if action not in ("start", "stop", "restart", "enable", "disable", "status"):
        raise HTTPException(status_code=400, detail="Ação inválida. Use start, stop, restart, enable ou disable.")

    cmd_args = ["systemctl", action, "samba-ad-dc"]

    task = executor.run_command(
        command=cmd_args,
        description=f"Ação no serviço Samba AD DC: {action}"
    )

    return {"message": f"Comando '{action}' enviado", "task_id": task.id, "log_file": task.log_file}
