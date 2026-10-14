import logging
from typing import Any, Dict, List, Optional, Union
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.core.config import settings
from app.core.executor import executor
from app.models.dhcp import DhcpConfig, DhcpBackendType
from app.schemas import DhcpConfigRequest, DhcpLeaseInfo, DhcpServiceStatus
from app.services.dhcp import dhcp_service

logger = logging.getLogger("sglinux.api.dhcp")

router = APIRouter(prefix="/dhcp", tags=["Kea DHCP Server (kea-dhcp4-server)"])

@router.get("/status", response_model=DhcpServiceStatus)
def get_dhcp_status():
    """
    Retorna se o serviço systemd 'kea-dhcp4-server' está ativo e executando.
    """
    return dhcp_service.get_service_status()

@router.get("/leases", response_model=List[DhcpLeaseInfo])
def get_dhcp_leases():
    """
    Lê o arquivo '/var/lib/kea/kea-leases4.csv' e retorna a lista de dispositivos
    que pegaram IP (IP, MAC Address, Hostname, Expiração).
    """
    return dhcp_service.get_leases()

@router.post("/install")
def install_kea_packages():
    """
    Dispara a instalação do pacote kea-dhcp4-server via apt-get se ainda não estiver instalado.
    """
    task = dhcp_service.install_packages()
    return {
        "message": "Instalação do Kea DHCPv4 iniciada",
        "task_id": task.id,
        "log_file": task.log_file
    }

@router.post("/preview")
def preview_kea_config(config: DhcpConfigRequest):
    """
    Gera uma pré-visualização do arquivo JSON do Kea DHCPv4 (/etc/kea/kea-dhcp4.conf).
    """
    try:
        content = dhcp_service.generate_config(config)
        return {
            "backend": "kea",
            "content": content,
            "path": str(dhcp_service.config_path)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao gerar preview do Kea: {e}")

@router.post("/apply")
def apply_dhcp_config(payload: Union[DhcpConfigRequest, DhcpConfig]):
    """
    Aplica a configuração do Kea DHCPv4:
    1. Instala pacotes via apt se necessário
    2. Gera /etc/kea/kea-dhcp4.conf
    3. Valida com 'kea-dhcp4 -t'
    4. Reinicia o serviço 'systemctl restart kea-dhcp4-server'
    5. Restaura backup caso a validação falhe
    """
    try:
        if isinstance(payload, DhcpConfigRequest):
            req = payload
        else:
            # Converter de DhcpConfig legado se necessário
            first_sub = payload.subnets[0]
            from ipaddress import IPv4Address
            req = DhcpConfigRequest(
                interface=payload.interface or "eth0",
                subnet=first_sub.subnet,
                pool_start=IPv4Address(first_sub.pool_start),
                pool_end=IPv4Address(first_sub.pool_end),
                routers=[IPv4Address(first_sub.gateway)] if first_sub.gateway else [],
                dns_servers=[IPv4Address(d) for d in first_sub.dns_servers] if first_sub.dns_servers else [IPv4Address("127.0.0.1")],
                lease_time=86400
            )

        res = dhcp_service.apply_config(req)
        return res
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha ao aplicar configuração do Kea DHCP: {e}")

@router.websocket("/ws/apply")
async def websocket_dhcp_apply(websocket: WebSocket):
    """
    Canal WebSocket para aplicar configuração do Kea DHCPv4 e transmitir o progresso
    da instalação e reinício do serviço em tempo real no xterm.js.
    """
    await websocket.accept()
    task_id = websocket.query_params.get("task_id")
    subscribed_task_id = None

    try:
        if task_id:
            subscribed_task_id = task_id
            await executor.register_subscriber(websocket, task_id=task_id)
            while True:
                msg = await websocket.receive_text()
                if msg == "ping":
                    await websocket.send_text("pong")
        else:
            # Recebe payload JSON do cliente
            try:
                raw_payload = await websocket.receive_json()
            except Exception as e:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Formato JSON inválido: {e}"
                })
                await websocket.close()
                return

            # Validação via Pydantic DhcpConfigRequest
            try:
                req = DhcpConfigRequest(**raw_payload)
            except ValidationError as ve:
                err_messages = "; ".join([f"{e['loc']}: {e['msg']}" for e in ve.errors()])
                await websocket.send_json({
                    "type": "error",
                    "message": f"Erro de validação: {err_messages}"
                })
                await websocket.close()
                return

            # 1. Verifica instalação de pacotes
            if not dhcp_service.is_installed() and not settings.SIMULATION_MODE:
                await websocket.send_json({
                    "type": "log",
                    "data": "\x1b[1;33m[1/3] Pacote kea-dhcp4-server não detectado. Instalando via apt...\x1b[0m"
                })
                install_task = dhcp_service.install_packages()
                await executor.register_subscriber(websocket, task_id=install_task.id)

            # 2. Gerar configuração e validar
            await websocket.send_json({
                "type": "log",
                "data": f"\x1b[1;36m[2/3] Gerando arquivo {dhcp_service.config_path}...\x1b[0m"
            })

            try:
                res = dhcp_service.apply_config(req)
                subscribed_task_id = res["task_id"]
                await executor.register_subscriber(websocket, task_id=subscribed_task_id)

                await websocket.send_json({
                    "type": "started",
                    "task_id": subscribed_task_id,
                    "message": res["message"],
                    "log_file": res.get("log_file")
                })
            except ValueError as ve:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Falha na validação do Kea: {ve}"
                })
                await websocket.close()
                return

            while True:
                msg = await websocket.receive_text()
                if msg == "ping":
                    await websocket.send_text("pong")

    except WebSocketDisconnect:
        if subscribed_task_id:
            executor.unregister_subscriber(websocket, task_id=subscribed_task_id)
    except Exception as e:
        if subscribed_task_id:
            executor.unregister_subscriber(websocket, task_id=subscribed_task_id)
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
