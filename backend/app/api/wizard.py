import logging
import psutil
from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.schemas import WizardSetupRequest
from app.services.wizard_orchestrator import WizardOrchestrator

logger = logging.getLogger("sglinux.api.wizard")

router = APIRouter(prefix="/wizard", tags=["Setup Wizard"])


@router.post("/validate")
def validate_wizard_setup(req: WizardSetupRequest) -> Dict[str, Any]:
    """
    Valida sintaticamente e semanticamente os parâmetros do Setup Wizard
    antes do início da execução do provisionamento contínuo.
    """
    return {
        "valid": True,
        "message": "Parâmetros do Setup Wizard validados com sucesso.",
        "server_ip_cidr": req.server_ip_cidr,
        "interface": req.network_interface,
        "realm": req.realm,
        "domain": req.domain,
        "dhcp_enabled": req.enable_dhcp,
        "firewall_enabled": req.enable_firewall
    }


async def websocket_wizard_execute(websocket: WebSocket):
    """
    Canal WebSocket para orquestração unificada contínua:
    Recebe JSON do 'WizardSetupRequest', valida e transmite progresso (0%-100%)
    e logs de saída em tempo real até a finalização ou erro.
    """
    await websocket.accept()
    orchestrator: WizardOrchestrator = None

    try:
        # Receber dados iniciais de configuração do Setup Wizard
        raw_payload = await websocket.receive_json()

        try:
            req = WizardSetupRequest(**raw_payload)
        except ValidationError as ve:
            errors = "; ".join([f"{e['loc'][-1] if e['loc'] else 'campo'}: {e['msg']}" for e in ve.errors()])
            await websocket.send_json({
                "type": "error",
                "message": f"Erro de validação dos parâmetros: {errors}",
                "step": 0
            })
            await websocket.close()
            return

        # Instanciar e disparar o orquestrador sequencial
        orchestrator = WizardOrchestrator(request=req, websocket=websocket)
        await orchestrator.execute()

        # Mantém conexão aberta para eventuais pings até o cliente desconectar
        while True:
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")

    except WebSocketDisconnect:
        logger.info("Cliente desconectou do WebSocket do Setup Wizard.")
        if orchestrator:
            orchestrator.cancelled = True
    except Exception as e:
        logger.exception(f"Erro no WebSocket do Setup Wizard: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": f"Erro interno do servidor: {str(e)}",
                "step": 0
            })
        except Exception:
            pass
