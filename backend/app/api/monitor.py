import asyncio
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status

from app.schemas import (
    ServiceActionResponse,
    ServiceLogsResponse,
    SystemMonitorPayload,
    UserInfo,
)
from app.services.auth import get_current_user
from app.services.monitor import MonitorService

router = APIRouter(prefix="/monitor", tags=["System & Services Monitor"])


@router.get("/snapshot", response_model=SystemMonitorPayload, summary="Snapshot instantâneo de métricas e status de serviços")
def get_monitor_snapshot():
    """
    Retorna o estado atual completo das métricas de hardware, rede, SO e serviços de infraestrutura.
    Ideal para renderização inicial e diagnósticos HTTP.
    """
    return MonitorService.get_telemetry_snapshot()


@router.post("/service/{service_name}/{action}", response_model=ServiceActionResponse, summary="Controle de serviço (start, stop, restart)")
def control_service(
    service_name: str,
    action: str,
    user: UserInfo = Depends(get_current_user),
):
    """
    Executa start, stop ou restart nos serviços essenciais do Ubuntu Server:
    - `samba-ad-dc`
    - `kea-dhcp4-server`
    - `ufw`
    - `ssh`
    Requer autenticação administrativa.
    """
    res = MonitorService.control_service(service_name, action)
    if not res.success and res.status_text == "not_found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=res.message,
        )
    if not res.success and res.status_text == "invalid_action":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=res.message,
        )
    return res


@router.get("/logs/{service_name}", response_model=ServiceLogsResponse, summary="Últimas 100 linhas do journalctl do serviço")
def get_service_logs(
    service_name: str,
    lines: int = Query(default=100, ge=1, le=500, description="Quantidade de linhas a retornar"),
    user: UserInfo = Depends(get_current_user),
):
    """
    Retorna as últimas linhas do log do systemd (`journalctl -u <service_name> --no-pager`)
    para diagnóstico rápido e auditoria em tempo real.
    """
    return MonitorService.get_service_logs(service_name, lines=lines)


# ==============================================================================
# WEBSOCKET STREAMING DE TELEMETRIA EM TEMPO REAL (/ws/monitor)
# ==============================================================================

async def websocket_monitor_telemetry(websocket: WebSocket):
    """
    WebSocket endpoint que transmite o payload completo de telemetria a cada 2 segundos.
    Permite desconexão limpa quando o utilizador sai do Dashboard.
    """
    await websocket.accept()

    try:
        while True:
            # Recolhe o snapshot de telemetria
            snapshot = MonitorService.get_telemetry_snapshot()
            
            # Envia em formato JSON
            await websocket.send_text(snapshot.model_dump_json())

            # Intervalo de atualização de 2 segundos conforme requisito
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        # Cliente navegou para outra aba ou fechou o browser
        pass
    except Exception as e:
        try:
            await websocket.close(code=1011, reason=str(e))
        except Exception:
            pass
