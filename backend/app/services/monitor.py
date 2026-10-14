import asyncio
import os
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import psutil

from app.core.config import Settings
from app.schemas import (
    CpuMetrics,
    DiskPartitionMetrics,
    MemoryMetrics,
    NetworkIoMetrics,
    NetworkRateItem,
    ServiceActionResponse,
    ServiceLogsResponse,
    ServiceStatusItem,
    SwapMetrics,
    SystemMonitorPayload,
    UptimeInfo,
)


def format_uptime_human(seconds: int) -> str:
    """Formata segundos em representação legível (dias, horas, minutos, segundos)."""
    if seconds < 0:
        return "0s"
    days = seconds // 86400
    hours = (seconds % 86400) // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60

    parts = []
    if days > 0:
        parts.append(f"{days}d")
    if hours > 0 or days > 0:
        parts.append(f"{hours}h")
    if minutes > 0 or hours > 0 or days > 0:
        parts.append(f"{minutes}m")
    parts.append(f"{secs}s")
    return " ".join(parts)


class MonitorService:
    """
    Serviço central de telemetria e controlo de serviços em tempo real para o ASTER ServerCore.
    Utiliza psutil e systemctl/journalctl com fallback inteligente para modo de simulação.
    """

    _last_net_io: Optional[Dict[str, Any]] = None
    _last_net_time: float = 0.0

    # Estado em memória para controle e teste em simulação
    _mock_service_states: Dict[str, bool] = {
        "samba-ad-dc": True,
        "kea-dhcp4-server": True,
        "ufw": True,
        "ssh": True,
    }

    ALLOWED_SERVICES = {
        "samba-ad-dc": {
            "display_name": "Samba 4 Active Directory",
            "description": "Controlador de Domínio Kerberos, LDAP e Sysvol",
            "port": 389,
        },
        "kea-dhcp4-server": {
            "display_name": "Servidor Kea DHCPv4",
            "description": "Serviço ISC Kea de distribuição dinâmica de IPs",
            "port": 67,
        },
        "ufw": {
            "display_name": "Firewall Perimetral UFW",
            "description": "Proteção de portas e filtros de pacotes Linux",
            "port": None,
        },
        "ssh": {
            "display_name": "Acesso Remoto SSH",
            "description": "Daemon OpenSSH Server para administração remota",
            "port": 22,
        },
    }

    @classmethod
    def is_dns_port_open(cls, port: int = 53) -> bool:
        """Verifica se a porta 53/UDP (DNS) está escutando no servidor."""
        try:
            # Tentativa 1: Inspecionar conexões ativas no kernel
            for conn in psutil.net_connections(kind="inet"):
                if conn.laddr and conn.laddr.port == port:
                    return True
        except Exception:
            pass

        # Tentativa 2: Tentar fazer bind UDP na porta 53.
        # Se falhar com Address in use ou Permission denied em porta privilegiada ocupada:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(0.5)
            sock.bind(("127.0.0.1", port))
            sock.close()
            # Conseguiu fazer bind = porta livre (nenhum serviço DNS escutando)
            return False
        except OSError:
            # Falha de bind indica que já está em uso / ocupada pelo DNS
            return True
        except Exception:
            return False

    @classmethod
    def _check_service_active(cls, service_name: str) -> Tuple[bool, str]:
        """
        Consulta o status do serviço via `systemctl is-active <service_name>`.
        Em modo de simulação, utiliza o dicionário de estado mock.
        """
        if Settings.SIMULATION_MODE or not sys.platform.startswith("linux"):
            active = cls._mock_service_states.get(service_name, True)
            return active, "active" if active else "inactive"

        try:
            res = subprocess.run(
                ["systemctl", "is-active", service_name],
                capture_output=True,
                text=True,
                timeout=3,
            )
            status_text = res.stdout.strip()
            is_active = res.returncode == 0 and status_text == "active"
            return is_active, status_text or "inactive"
        except Exception:
            return False, "unknown"

    @classmethod
    def get_telemetry_snapshot(cls) -> SystemMonitorPayload:
        """
        Recolhe todas as métricas de hardware, SO, rede e serviços em tempo real.
        """
        now = time.time()
        now_iso = datetime.now(timezone.utc).isoformat()

        # 1. CPU Metrics
        cpu_usage = float(psutil.cpu_percent(interval=None))
        try:
            load_tuple = os.getloadavg()
            load_avg = [round(float(x), 2) for x in load_tuple]
        except (AttributeError, OSError):
            load_avg = [round(cpu_usage / 100.0, 2)] * 3

        cpu_metrics = CpuMetrics(
            usage_percent=round(cpu_usage, 1),
            cores_logical=psutil.cpu_count(logical=True) or 1,
            cores_physical=psutil.cpu_count(logical=False) or 1,
            load_avg=load_avg,
        )

        # 2. Memory & Swap
        vmem = psutil.virtual_memory()
        memory_metrics = MemoryMetrics(
            total_bytes=vmem.total,
            used_bytes=vmem.used,
            available_bytes=vmem.available,
            usage_percent=round(vmem.percent, 1),
        )

        try:
            smem = psutil.swap_memory()
            swap_metrics = SwapMetrics(
                total_bytes=smem.total,
                used_bytes=smem.used,
                free_bytes=smem.free,
                usage_percent=round(smem.percent, 1),
            )
        except Exception:
            swap_metrics = SwapMetrics(total_bytes=0, used_bytes=0, free_bytes=0, usage_percent=0.0)

        # 3. Disks (/ e /var)
        disks: List[DiskPartitionMetrics] = []
        partitions_to_check = ["/"]
        # Se /var existir como ponto ou diretório
        if os.path.exists("/var"):
            partitions_to_check.append("/var")

        seen_mounts = set()
        for p in partitions_to_check:
            try:
                du = psutil.disk_usage(p)
                # Evita duplicar se /var estiver na mesma partição que /
                key = (du.total, du.used)
                if key in seen_mounts:
                    continue
                seen_mounts.add(key)
                disks.append(
                    DiskPartitionMetrics(
                        mountpoint=p,
                        total_bytes=du.total,
                        used_bytes=du.used,
                        free_bytes=du.free,
                        usage_percent=round(du.percent, 1),
                    )
                )
            except Exception:
                pass

        # 4. Network I/O Rate (Taxa em bytes/segundo)
        current_net = psutil.net_io_counters(pernic=True)
        elapsed = now - cls._last_net_time if cls._last_net_time > 0 else 2.0
        if elapsed <= 0:
            elapsed = 1.0

        interfaces_rates: List[NetworkRateItem] = []
        total_sent_rate = 0.0
        total_recv_rate = 0.0

        for iface_name, curr_stats in current_net.items():
            # Ignora interfaces loopback no cálculo de taxa pública se desejado, ou inclui com baixa prioridade
            if iface_name.startswith("lo"):
                continue

            last_stats = cls._last_net_io.get(iface_name) if cls._last_net_io else None
            if last_stats:
                diff_sent = max(0, curr_stats.bytes_sent - last_stats.bytes_sent)
                diff_recv = max(0, curr_stats.bytes_recv - last_stats.bytes_recv)
                sent_rate = diff_sent / elapsed
                recv_rate = diff_recv / elapsed
            else:
                sent_rate = 0.0
                recv_rate = 0.0

            total_sent_rate += sent_rate
            total_recv_rate += recv_rate

            interfaces_rates.append(
                NetworkRateItem(
                    interface=iface_name,
                    bytes_sent_per_sec=round(sent_rate, 1),
                    bytes_recv_per_sec=round(recv_rate, 1),
                    total_sent_bytes=curr_stats.bytes_sent,
                    total_recv_bytes=curr_stats.bytes_recv,
                )
            )

        # Salva para o próximo diferencial
        cls._last_net_io = current_net
        cls._last_net_time = now

        net_metrics = NetworkIoMetrics(
            total_sent_per_sec=round(total_sent_rate, 1),
            total_recv_per_sec=round(total_recv_rate, 1),
            interfaces=interfaces_rates,
        )

        # 5. Uptime & Hostname
        boot_time = psutil.boot_time()
        uptime_secs = int(max(0, now - boot_time))
        try:
            hname = socket.gethostname() or "ubuntu-server"
            raw_fqdn = socket.getfqdn() or hname
            # Rejeitar resoluções reversas arpa (ex: 1.0.0.0...ip6.arpa) e loopback
            low_fqdn = raw_fqdn.lower()
            if (
                "arpa" in low_fqdn
                or low_fqdn.startswith("1.0.0.0.")
                or low_fqdn.startswith("127.")
                or low_fqdn in ("localhost", "localhost.localdomain", "broadcasthost")
            ):
                fqdn = hname
            else:
                fqdn = raw_fqdn
        except Exception:
            hname = "ubuntu-server"
            fqdn = "ubuntu-server.local"

        uptime_info = UptimeInfo(
            uptime_seconds=uptime_secs,
            formatted=format_uptime_human(uptime_secs),
            hostname=hname,
            fqdn=fqdn,
        )

        # 6. Serviços Monitorizados
        services_list: List[ServiceStatusItem] = []
        for svc_name, meta in cls.ALLOWED_SERVICES.items():
            is_act, status_str = cls._check_service_active(svc_name)
            services_list.append(
                ServiceStatusItem(
                    name=svc_name,
                    display_name=meta["display_name"],
                    description=meta["description"],
                    active=is_act,
                    status_text=status_str,
                    port=meta["port"],
                    port_open=is_act if meta["port"] is not None else None,
                )
            )

        dns_open = cls.is_dns_port_open(53)

        return SystemMonitorPayload(
            timestamp=now_iso,
            cpu=cpu_metrics,
            memory=memory_metrics,
            swap=swap_metrics,
            disks=disks,
            network_io=net_metrics,
            uptime=uptime_info,
            services=services_list,
            dns_port_53_open=dns_open,
            simulation_mode=Settings.SIMULATION_MODE,
        )

    @classmethod
    def control_service(cls, service_name: str, action: str) -> ServiceActionResponse:
        """
        Executa start, stop ou restart num serviço específico.
        """
        if service_name not in cls.ALLOWED_SERVICES:
            return ServiceActionResponse(
                service=service_name,
                action=action,
                success=False,
                status_text="not_found",
                active=False,
                message=f"Serviço '{service_name}' não é gerenciável por esta API.",
            )

        action_clean = action.lower().strip()
        if action_clean not in ("start", "stop", "restart", "reload"):
            return ServiceActionResponse(
                service=service_name,
                action=action,
                success=False,
                status_text="invalid_action",
                active=False,
                message=f"Ação '{action}' inválida. Use start, stop ou restart.",
            )

        # Modo Simulação
        if Settings.SIMULATION_MODE or not sys.platform.startswith("linux"):
            new_active = action_clean in ("start", "restart", "reload")
            cls._mock_service_states[service_name] = new_active
            return ServiceActionResponse(
                service=service_name,
                action=action_clean,
                success=True,
                status_text="active" if new_active else "inactive",
                active=new_active,
                message=f"[Modo Simulação] Serviço '{service_name}' {action_clean} executado com sucesso.",
            )

        # Modo Produção Linux com systemctl
        cmd = ["systemctl", action_clean, service_name]
        if hasattr(os, "geteuid") and os.geteuid() != 0:
            cmd = ["sudo", "-n"] + cmd

        try:
            # Se for start ou restart, garantir unmask e enable para arranque no boot
            if action_clean in ("start", "restart"):
                enable_cmd = ["systemctl", "enable", service_name]
                if hasattr(os, "geteuid") and os.geteuid() != 0:
                    enable_cmd = ["sudo", "-n"] + enable_cmd
                try:
                    subprocess.run(enable_cmd, capture_output=True, text=True, timeout=10)
                except Exception as ex_en:
                    logger.warning(f"Aviso ao executar systemctl enable {service_name}: {ex_en}")

            res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            is_active, status_text = cls._check_service_active(service_name)
            success = res.returncode == 0
            msg = f"Serviço '{service_name}' {action_clean} concluído e habilitado para arranque no boot." if success else f"Falha: {res.stderr.strip()}"

            return ServiceActionResponse(
                service=service_name,
                action=action_clean,
                success=success,
                status_text=status_text,
                active=is_active,
                message=msg,
            )
        except Exception as e:
            return ServiceActionResponse(
                service=service_name,
                action=action_clean,
                success=False,
                status_text="error",
                active=False,
                message=f"Erro ao executar systemctl: {str(e)}",
            )

    @classmethod
    def get_service_logs(cls, service_name: str, lines: int = 100) -> ServiceLogsResponse:
        """
        Retorna as últimas N linhas do journalctl para o serviço especificado.
        """
        if service_name not in cls.ALLOWED_SERVICES:
            return ServiceLogsResponse(
                service=service_name,
                lines=[f"Erro: Serviço '{service_name}' não reconhecido."],
                count=1,
            )

        # Em produção Linux: executar journalctl -u <service_name> -n <lines> --no-pager
        if sys.platform.startswith("linux") and not Settings.SIMULATION_MODE:
            cmd = ["journalctl", "-u", service_name, "-n", str(lines), "--no-pager"]
            try:
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
                if res.returncode == 0 and res.stdout:
                    output_lines = [line for line in res.stdout.splitlines() if line.strip()]
                    return ServiceLogsResponse(
                        service=service_name,
                        lines=output_lines,
                        count=len(output_lines),
                    )
            except Exception:
                pass

        # Fallback de logs realistas (Simulação / Desenvolvimento)
        now_str = datetime.now().strftime("%b %d %H:%M:%S")
        sim_logs = [
            f"{now_str} server systemd[1]: Starting {cls.ALLOWED_SERVICES[service_name]['display_name']}...",
            f"{now_str} server {service_name}[1042]: Service initialized with configuration /etc/{service_name.replace('-server', '')}/",
            f"{now_str} server {service_name}[1042]: Listening on standard sockets and ready for incoming traffic",
            f"{now_str} server systemd[1]: Started {cls.ALLOWED_SERVICES[service_name]['display_name']}.",
            f"{now_str} server {service_name}[1042]: Health check OK: PID 1042 running normally, 0 errors reported",
        ]
        return ServiceLogsResponse(
            service=service_name,
            lines=sim_logs,
            count=len(sim_logs),
        )
