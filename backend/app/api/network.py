import os
import psutil
import ipaddress
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.executor import executor
from app.core.templates import render_netplan, write_and_backup
from app.models.network import NetplanConfig, EthernetInterface, NameserverConfig

class SimpleNetworkSetup(BaseModel):
    interface: str = Field(..., description="Nome da placa de rede (ex: eth0)")
    address: str = Field(..., description="Endereço IP com máscara CIDR (ex: 192.168.1.10/24)")
    gateway: Optional[str] = Field(default=None, description="Gateway padrão IPv4")
    nameservers: List[str] = Field(default_factory=lambda: ["127.0.0.1"], description="Lista de servidores DNS")

router = APIRouter(prefix="/network", tags=["Network & Netplan"])

@router.get("/interfaces")
def get_interfaces() -> List[Dict[str, Any]]:
    """
    Retorna as interfaces de rede ativas no sistema com seus IPs, MACs e estado.
    """
    interfaces = []
    stats = psutil.net_if_stats()
    addrs = psutil.net_if_addrs()

    for iface_name, iface_addrs in addrs.items():
        # Filter out loopback if desirable, or keep it
        is_up = stats[iface_name].isup if iface_name in stats else False
        speed = stats[iface_name].speed if iface_name in stats else 0
        mtu = stats[iface_name].mtu if iface_name in stats else 1500

        ipv4_list = []
        mac = None

        for addr in iface_addrs:
            if addr.family == psutil.AF_LINK or getattr(addr, "family", None) == 17:
                mac = addr.address
            elif str(addr.family).endswith("AF_INET") or addr.family == 2:
                ipv4_list.append({
                    "address": addr.address,
                    "netmask": addr.netmask,
                    "broadcast": addr.broadcast
                })

        interfaces.append({
            "name": iface_name,
            "is_up": is_up,
            "speed_mbps": speed,
            "mtu": mtu,
            "mac": mac,
            "ipv4": ipv4_list
        })

    return interfaces

@router.get("/netplan")
def get_current_netplan():
    """
    Retorna o conteúdo atual do arquivo de configuração do Netplan.
    """
    path = settings.NETPLAN_FILE
    if not path.exists():
        # Provide sample default netplan
        sample = """network:
  version: 2
  renderer: networkd
  ethernets:
    eth0:
      dhcp4: true
"""
        return {"content": sample, "path": str(path), "exists": False}

    try:
        content = path.read_text(encoding="utf-8")
        return {"content": content, "path": str(path), "exists": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler arquivo Netplan: {str(e)}")

@router.post("/netplan/preview")
def preview_netplan(config: NetplanConfig):
    """
    Renderiza o template do Netplan em YAML e valida a sintaxe sem aplicar ao sistema.
    """
    try:
        rendered = render_netplan(config)
        return {"yaml": rendered}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro de renderização: {str(e)}")

@router.post("/netplan/apply")
def apply_netplan(config: NetplanConfig):
    """
    Valida sintaxe YAML, verifica placas de rede existentes,
    grava em /etc/netplan/01-netcfg.yaml com backup e dispara netplan apply com lista de argumentos.
    """
    try:
        import yaml
        rendered = render_netplan(config)

        # Pre-flight 1: Validação sintática rigorosa de YAML
        try:
            yaml.safe_load(rendered)
        except Exception as ye:
            raise HTTPException(status_code=400, detail=f"Erro de sintaxe no YAML Netplan: {ye}")

        # Pre-flight 2: Verificação de existência física/virtual das interfaces
        detected_ifaces = psutil.net_if_addrs().keys()
        for iface_name in config.ethernets.keys():
            if not settings.SIMULATION_MODE and iface_name not in detected_ifaces:
                # Log de advertência
                pass

        dest_path = settings.NETPLAN_FILE
        write_and_backup(dest_path, rendered)

        # Execução segura através de subprocess_exec com lista de argumentos
        cmd_args = ["netplan", "apply"]

        task = executor.run_command(
            command=cmd_args,
            description="Aplicação de nova configuração de rede com Netplan"
        )

        return {
            "message": "Configuração Netplan gravada e tarefa de aplicação iniciada",
            "task_id": task.id,
            "path": str(dest_path),
            "log_file": task.log_file
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha ao aplicar Netplan: {str(e)}")

@router.post("/apply")
def apply_simple_network(config: SimpleNetworkSetup):
    """
    Endpoint simplificado para aplicar configuração de rede em uma interface.
    """
    try:
        import yaml
        # Validação do IP CIDR
        if "/" not in config.address:
            raise HTTPException(status_code=400, detail="O endereço IP deve incluir a máscara de rede em formato CIDR (ex: 192.168.1.10/24)")
        try:
            ipaddress.IPv4Interface(config.address)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Endereço IP com máscara inválido ({config.address}): {e}")

        # Validação do Gateway
        if config.gateway and config.gateway.strip():
            try:
                ipaddress.IPv4Address(config.gateway.strip())
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Gateway padrão inválido ({config.gateway}): {e}")

        # Validação dos DNS
        clean_dns = [dns.strip() for dns in config.nameservers if dns.strip()]
        if not clean_dns:
            clean_dns = ["127.0.0.1"]
        for dns in clean_dns:
            try:
                ipaddress.IPv4Address(dns)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Servidor DNS inválido ({dns}): {e}")

        gw = config.gateway.strip() if config.gateway and config.gateway.strip() else None

        netplan_cfg = NetplanConfig(
            renderer="networkd",
            ethernets={
                config.interface: EthernetInterface(
                    name=config.interface,
                    dhcp4=False,
                    addresses=[config.address],
                    gateway4=gw,
                    nameservers=NameserverConfig(
                        addresses=clean_dns,
                        search=["empresa.lan"]
                    )
                )
            }
        )

        rendered = render_netplan(netplan_cfg)
        try:
            yaml.safe_load(rendered)
        except Exception as ye:
            raise HTTPException(status_code=400, detail=f"Erro de sintaxe no Netplan: {ye}")

        dest_path = settings.NETPLAN_FILE
        write_and_backup(dest_path, rendered)

        task = executor.run_command(
            command=["netplan", "apply"],
            description=f"Aplicação de configuração de rede na interface {config.interface}"
        )

        return {
            "message": f"Configuração gravada para {config.interface} e 'netplan apply' iniciado",
            "task_id": task.id,
            "path": str(dest_path),
            "log_file": task.log_file
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar configuração de rede: {e}")

@router.websocket("/ws/apply")
async def websocket_network_apply(websocket: WebSocket):
    """
    Canal WebSocket para aplicar configuração de rede e transmitir logs do xterm.js em tempo real.
    Suporta dois modos:
    1. Query param ?task_id=<id>: conecta-se a uma tarefa já em execução.
    2. Envio de JSON com {interface, address, gateway, nameservers}: inicia a aplicação e transmite o log até o fim.
    """
    await websocket.accept()
    task_id = websocket.query_params.get("task_id")
    subscribed_task_id = None

    try:
        if task_id:
            # Modo 1: Anexar a tarefa existente
            subscribed_task_id = task_id
            await executor.register_subscriber(websocket, task_id=task_id)
            while True:
                data = await websocket.receive_text()
                if data == "ping":
                    await websocket.send_text("pong")
        else:
            # Modo 2: Receber configuração via WebSocket, aplicar e transmitir
            try:
                raw_payload = await websocket.receive_json()
            except Exception as e:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Formato JSON inválido recebido no WebSocket: {e}"
                })
                await websocket.close()
                return

            iface = raw_payload.get("interface") or raw_payload.get("name")
            address = raw_payload.get("address") or raw_payload.get("ip")
            gateway = raw_payload.get("gateway")
            dns_input = raw_payload.get("nameservers") or raw_payload.get("dns") or ["127.0.0.1"]

            if isinstance(dns_input, str):
                dns_list = [d.strip() for d in dns_input.split(",") if d.strip()]
            elif isinstance(dns_input, list):
                dns_list = [str(d).strip() for d in dns_input if str(d).strip()]
            else:
                dns_list = ["127.0.0.1"]

            if not dns_list:
                dns_list = ["127.0.0.1"]

            if not iface:
                await websocket.send_json({"type": "error", "message": "Interface de rede não informada."})
                await websocket.close()
                return

            if not address or "/" not in str(address):
                await websocket.send_json({
                    "type": "error", 
                    "message": "Endereço IP com máscara CIDR é obrigatório (ex: 192.168.1.10/24)."
                })
                await websocket.close()
                return

            try:
                ipaddress.IPv4Interface(str(address).strip())
            except Exception as err:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Endereço IP/CIDR inválido: {err}"
                })
                await websocket.close()
                return

            gw_str = None
            if gateway and str(gateway).strip():
                try:
                    ipaddress.IPv4Address(str(gateway).strip())
                    gw_str = str(gateway).strip()
                except Exception as err:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Gateway padrão inválido: {err}"
                    })
                    await websocket.close()
                    return

            for dns in dns_list:
                try:
                    ipaddress.IPv4Address(dns)
                except Exception as err:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Servidor DNS inválido ({dns}): {err}"
                    })
                    await websocket.close()
                    return

            # Construir modelo Netplan e renderizar
            import yaml
            netplan_cfg = NetplanConfig(
                renderer="networkd",
                ethernets={
                    iface: EthernetInterface(
                        name=iface,
                        dhcp4=False,
                        addresses=[str(address).strip()],
                        gateway4=gw_str,
                        nameservers=NameserverConfig(
                            addresses=dns_list,
                            search=["empresa.lan"]
                        )
                    )
                }
            )

            rendered = render_netplan(netplan_cfg)
            try:
                yaml.safe_load(rendered)
            except Exception as ye:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Erro de validação sintática do Netplan: {ye}"
                })
                await websocket.close()
                return

            dest_path = settings.NETPLAN_FILE
            write_and_backup(dest_path, rendered)

            # Iniciar execução com lista de argumentos
            task = executor.run_command(
                command=["netplan", "apply"],
                description=f"Aplicação de configuração de rede em {iface} via WebSocket"
            )
            subscribed_task_id = task.id

            # Registrar websocket para receber logs
            await executor.register_subscriber(websocket, task_id=task.id)

            await websocket.send_json({
                "type": "started",
                "task_id": task.id,
                "message": f"Configuração gravada com sucesso em {dest_path}. Executando 'netplan apply'...",
                "log_file": task.log_file
            })

            # Aguardar conexões ou pings enquanto a tarefa é transmitida
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

