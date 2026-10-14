import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query

from app.core.firewall_profiles import FIREWALL_PROFILES, PROFILE_DETAILS
from app.models.firewall import (
    FirewallProfileApplyRequest,
    FirewallProfileInfo,
    FirewallToggleRequest,
    NatConfigRequest,
    NatStatusResponse,
    UfwRuleCreate,
    UfwStatus,
)
from app.services.firewall import firewall_service

logger = logging.getLogger("sglinux.api.firewall")

router = APIRouter(prefix="/firewall", tags=["Firewall & NAT"])


@router.get("/status", response_model=UfwStatus)
def get_firewall_status():
    """
    Retorna se o firewall está ativo e a lista de regras numeradas.
    """
    try:
        return firewall_service.get_status()
    except Exception as e:
        logger.error(f"Erro ao consultar status do UFW: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao consultar UFW: {str(e)}")


@router.post("/toggle")
def toggle_firewall(req: Optional[FirewallToggleRequest] = None):
    """
    Ativa ou desativa o UFW. Se o estado alvo não for especificado, inverte o estado atual.
    Ao ativar, garante sempre a liberação prévia da porta SSH (22/tcp) para evitar lockout.
    """
    try:
        target_state = req.enabled if req else None
        task = firewall_service.toggle(target_state=target_state)
        action_name = "ativar" if (target_state if target_state is not None else "alternar") else "desativar"
        return {
            "message": f"Comando para {action_name} o firewall submetido.",
            "task_id": task.id,
            "log_file": task.log_file,
        }
    except Exception as e:
        logger.error(f"Erro ao alternar UFW: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao alternar UFW: {str(e)}")


@router.post("/enable")
def enable_firewall(safe_ssh: bool = Query(default=True, description="Garantir liberação da porta SSH prévia")):
    """
    Ativa o firewall UFW garantindo a liberação prévia do SSH para evitar lockout.
    """
    try:
        task = firewall_service.enable(safe_ssh=safe_ssh)
        return {
            "message": "Comando para ativar UFW com salvaguarda SSH enviado.",
            "task_id": task.id,
            "log_file": task.log_file,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/disable")
def disable_firewall():
    """
    Desativa o firewall UFW.
    """
    try:
        task = firewall_service.disable()
        return {
            "message": "Comando para desativar UFW enviado.",
            "task_id": task.id,
            "log_file": task.log_file,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/profiles", response_model=List[FirewallProfileInfo])
def list_profiles():
    """
    Lista todos os perfis de infraestrutura mapeados e suas respectivas portas.
    """
    result: List[FirewallProfileInfo] = []
    for key, ports in FIREWALL_PROFILES.items():
        meta = PROFILE_DETAILS.get(key, {})
        result.append(
            FirewallProfileInfo(
                key=key,
                name=meta.get("name", key.upper()),
                description=meta.get("description", ""),
                ports=ports,
            )
        )
    return result


@router.post("/profiles/apply")
def apply_firewall_profiles(req: FirewallProfileApplyRequest):
    """
    Recebe uma lista de perfis selecionados (ex: ["ssh", "samba_ad", "dns", "dhcp"])
    e aplica as liberações no UFW.
    """
    if not req.profiles:
        raise HTTPException(status_code=400, detail="A lista de perfis não pode estar vazia.")

    try:
        task = firewall_service.apply_profiles(req.profiles)
        return {
            "message": f"Perfis aplicados com sucesso: {', '.join(req.profiles)}",
            "task_id": task.id,
            "applied_profiles": req.profiles,
            "log_file": task.log_file,
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Erro ao aplicar perfis: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao aplicar perfis: {str(e)}")


@router.post("/rule")
@router.post("/rules")
def add_firewall_rule(rule: UfwRuleCreate):
    """
    Adiciona regra personalizada (porta, protocolo, ação allow/deny, IP de origem opcional).
    """
    try:
        task = firewall_service.add_rule(rule)
        return {
            "message": f"Regra {rule.action.value.upper()} para {rule.port}/{rule.protocol.value} submetida.",
            "task_id": task.id,
            "log_file": task.log_file,
        }
    except Exception as e:
        logger.error(f"Erro ao adicionar regra: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao adicionar regra: {str(e)}")


@router.delete("/rule/{rule_number}")
@router.delete("/rules/{rule_number}")
def delete_firewall_rule(rule_number: int):
    """
    Remove uma regra do UFW pelo seu índice numérico (ufw delete <number>).
    """
    if rule_number < 1:
        raise HTTPException(status_code=400, detail="O índice da regra deve ser maior ou igual a 1.")

    try:
        task = firewall_service.delete_rule(rule_number)
        return {
            "message": f"Remoção da regra #{rule_number} solicitada com sucesso.",
            "task_id": task.id,
            "log_file": task.log_file,
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Erro ao remover regra #{rule_number}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao remover regra: {str(e)}")


@router.post("/nat")
def configure_firewall_nat(req: NatConfigRequest):
    """
    Ativa ou desativa roteamento com NAT/Masquerade informando interfaces WAN e LAN.
    - Ativa sysctl net.ipv4.ip_forward=1 persistente em /etc/sysctl.d/99-ip-forward.conf.
    - Adiciona regra de Masquerade em /etc/ufw/before.rules.
    - Ajusta DEFAULT_FORWARD_POLICY em /etc/default/ufw.
    - Executa ufw reload.
    """
    try:
        result = firewall_service.configure_nat(req)
        return result
    except Exception as e:
        logger.error(f"Erro ao configurar NAT: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao configurar NAT: {str(e)}")


@router.get("/nat", response_model=NatStatusResponse)
def get_firewall_nat_status():
    """
    Retorna o status atual do encaminhamento de pacotes IPv4 e do NAT/Masquerade.
    """
    try:
        return firewall_service.get_nat_status()
    except Exception as e:
        logger.error(f"Erro ao consultar status NAT: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao consultar NAT: {str(e)}")


@router.post("/presets/samba-ad")
def apply_samba_ad_preset():
    """
    Preset de compatibilidade retroativa para liberação do Samba 4 AD.
    """
    try:
        task = firewall_service.apply_profiles(["samba_ad"])
        return {
            "message": "Tarefa de liberação de portas do Samba 4 AD iniciada",
            "task_id": task.id,
            "ports_opened": FIREWALL_PROFILES["samba_ad"],
            "log_file": task.log_file,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
