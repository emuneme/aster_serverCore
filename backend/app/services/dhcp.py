import csv
import json
import logging
import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import settings
from app.core.executor import executor
from app.core.templates import write_and_backup
from app.schemas import DhcpConfigRequest, DhcpLeaseInfo, DhcpServiceStatus

logger = logging.getLogger("sglinux.dhcp")

class KeaDhcpService:
    """
    Serviço de gestão do ISC Kea DHCPv4 (kea-dhcp4-server) no Ubuntu Server.
    """

    PACKAGE_NAME = "kea-dhcp4-server"
    SERVICE_NAME = "kea-dhcp4-server"
    
    @property
    def config_path(self) -> Path:
        return settings.KEA_CONF_FILE

    @property
    def lease_file(self) -> Path:
        if settings.SIMULATION_MODE:
            p = settings.MOCK_ETC_DIR / "kea" / "kea-leases4.csv"
            p.parent.mkdir(parents=True, exist_ok=True)
            return p
        return Path("/var/lib/kea/kea-leases4.csv")

    def is_installed(self) -> bool:
        """
        Verifica se o pacote kea-dhcp4 está instalado no sistema.
        """
        if settings.SIMULATION_MODE:
            return True
        return shutil.which("kea-dhcp4") is not None

    def install_packages(self) -> Any:
        """
        Instala o pacote kea-dhcp4-server via apt-get se ainda não estiver instalado.
        Retorna a tarefa em background do CommandExecutor.
        """
        logger.info(f"Iniciando instalação de {self.PACKAGE_NAME}...")
        cmd_args = ["apt-get", "install", "-y", self.PACKAGE_NAME]
        task = executor.run_command(
            command=cmd_args,
            description="Instalação do servidor ISC Kea DHCPv4 (apt-get install -y kea-dhcp4-server)"
        )
        return task

    def generate_config_dict(self, req: DhcpConfigRequest) -> Dict[str, Any]:
        """
        Gera o dicionário de configuração conforme especificação JSON do Kea DHCPv4.
        """
        valid_lifetime = req.lease_time
        renew_timer = valid_lifetime // 2
        rebind_timer = int(valid_lifetime * 0.875)

        option_data: List[Dict[str, str]] = []

        if req.routers:
            routers_str = ", ".join(str(r) for r in req.routers)
            option_data.append({
                "name": "routers",
                "data": routers_str
            })

        if req.dns_servers:
            dns_str = ", ".join(str(d) for d in req.dns_servers)
            option_data.append({
                "name": "domain-name-servers",
                "data": dns_str
            })

        config: Dict[str, Any] = {
            "Dhcp4": {
                "interfaces-config": {
                    "interfaces": [req.interface]
                },
                "lease-database": {
                    "type": "memfile",
                    "persist": True,
                    "name": str(self.lease_file),
                    "lfc-interval": 3600
                },
                "valid-lifetime": valid_lifetime,
                "renew-timer": renew_timer,
                "rebind-timer": rebind_timer,
                "subnet4": [
                    {
                        "id": 1,
                        "subnet": req.subnet,
                        "pools": [
                            {
                                "pool": f"{req.pool_start} - {req.pool_end}"
                            }
                        ],
                        "option-data": option_data
                    }
                ]
            }
        }
        return config

    def generate_config(self, req: DhcpConfigRequest) -> str:
        """
        Serializa a configuração do Kea DHCPv4 em JSON formatado com indentação.
        """
        config_dict = self.generate_config_dict(req)
        return json.dumps(config_dict, indent=4)

    def validate_config_syntax(self, config_file: Path) -> Tuple[bool, str]:
        """
        Valida a sintaxe do arquivo de configuração gerado executando:
        kea-dhcp4 -t <caminho_do_arquivo>
        """
        if not config_file.exists():
            return False, f"Arquivo de configuração {config_file} não encontrado."

        # Validação básica de JSON
        try:
            with open(config_file, "r", encoding="utf-8") as f:
                parsed = json.load(f)
            if "Dhcp4" not in parsed:
                return False, "Estrutura JSON inválida: chave raiz 'Dhcp4' ausente."
        except json.JSONDecodeError as jde:
            return False, f"Erro de sintaxe JSON: {jde}"

        # Se em produção e binário kea-dhcp4 disponível, executa verificação nativa
        if not settings.SIMULATION_MODE and shutil.which("kea-dhcp4"):
            try:
                cmd = ["kea-dhcp4", "-t", str(config_file)]
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
                if proc.returncode != 0:
                    err_msg = proc.stderr.strip() or proc.stdout.strip()
                    return False, f"Falha na validação nativa do Kea: {err_msg}"
            except Exception as e:
                return False, f"Erro ao executar kea-dhcp4 -t: {e}"

        return True, "Sintaxe do Kea DHCPv4 validada com sucesso."

    def apply_config(self, req: DhcpConfigRequest) -> Dict[str, Any]:
        """
        Fluxo completo de aplicação:
        1. Gera o arquivo /etc/kea/kea-dhcp4.conf com backup automático
        2. Valida com kea-dhcp4 -t
        3. Se falhar, restaura backup
        4. Se passar, reinicia e habilita no systemd
        """
        dest_path = self.config_path
        new_content = self.generate_config(req)

        # 1. Backup e escrita
        backup_path = write_and_backup(dest_path, new_content)

        # 2. Validação sintática
        is_valid, val_msg = self.validate_config_syntax(dest_path)
        if not is_valid:
            # Rollback imediato se validação falhar
            if backup_path and backup_path.exists():
                shutil.copy2(backup_path, dest_path)
                logger.warning(f"Configuração Kea inválida. Rollback restaurado de {backup_path}")
            raise ValueError(f"Configuração do Kea rejeitada: {val_msg}")

        # 3. Habilitação e reinício do serviço systemd
        # Lista de comandos para o executor
        cmd_args = ["systemctl", "restart", self.SERVICE_NAME]
        task = executor.run_command(
            command=cmd_args,
            description=f"Aplicação e reinício do Kea DHCPv4 ({self.SERVICE_NAME})"
        )

        # Habilitar no boot de forma não-bloqueante se não em simulação
        if not settings.SIMULATION_MODE and settings.is_root:
            try:
                subprocess.run(["systemctl", "enable", self.SERVICE_NAME], capture_output=True)
            except Exception as e:
                logger.warning(f"Aviso ao habilitar serviço no boot: {e}")

        return {
            "message": f"Configuração Kea DHCPv4 validada e gravada em {dest_path}. Serviço reiniciado.",
            "task_id": task.id,
            "config_path": str(dest_path),
            "log_file": task.log_file,
            "backup_path": str(backup_path) if backup_path else None
        }

    def get_service_status(self) -> DhcpServiceStatus:
        """
        Retorna se o serviço systemd 'kea-dhcp4-server' está ativo e executando.
        """
        installed = self.is_installed()
        config_exists = self.config_path.exists()
        active = False
        status_text = "inativo"

        if settings.SIMULATION_MODE:
            active = config_exists
            status_text = "active (running) [Simulação]" if active else "inactive (dead) [Simulação]"
            return DhcpServiceStatus(
                active=active,
                status_text=status_text,
                installed=installed,
                config_path=str(self.config_path),
                config_exists=config_exists,
                version="2.4.0-ubuntu",
                simulation_mode=True
            )

        if shutil.which("systemctl"):
            try:
                proc = subprocess.run(
                    ["systemctl", "is-active", self.SERVICE_NAME],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                status_text = proc.stdout.strip()
                active = (proc.returncode == 0 and status_text == "active")
            except Exception as e:
                status_text = f"erro ao consultar: {e}"

        return DhcpServiceStatus(
            active=active,
            status_text=status_text,
            installed=installed,
            config_path=str(self.config_path),
            config_exists=config_exists,
            simulation_mode=False
        )

    def get_leases(self) -> List[DhcpLeaseInfo]:
        """
        Lê o arquivo CSV /var/lib/kea/kea-leases4.csv e retorna a lista de concessões ativas.
        """
        leases: List[DhcpLeaseInfo] = []
        path = self.lease_file

        if path.exists():
            try:
                with open(path, mode="r", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        ip = row.get("address")
                        mac = row.get("hwaddr")
                        hostname = row.get("hostname") or "n/a"
                        expire_val = row.get("expire")
                        client_id = row.get("client_id")
                        valid_lft = int(row.get("valid_lifetime", 86400)) if row.get("valid_lifetime") else None

                        formatted_expire = None
                        if expire_val:
                            try:
                                # Se for timestamp epoch
                                ts = int(expire_val)
                                formatted_expire = datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S UTC")
                            except (ValueError, OSError):
                                formatted_expire = str(expire_val)

                        if ip and mac:
                            leases.append(DhcpLeaseInfo(
                                ip_address=ip,
                                mac_address=mac,
                                hostname=hostname,
                                expire_time=formatted_expire,
                                client_id=client_id,
                                valid_lft=valid_lft,
                                state="ativo"
                            ))
            except Exception as e:
                logger.error(f"Erro ao ler concessões de {path}: {e}")

        # Se não houver arquivo físico ou estiver vazio em modo de simulação, gera dados de exemplo
        if not leases and settings.SIMULATION_MODE:
            leases = [
                DhcpLeaseInfo(
                    ip_address="192.168.1.100",
                    mac_address="bc:24:11:8a:42:01",
                    hostname="estacao-financeiro-01",
                    expire_time="2026-10-15 14:30:00 UTC",
                    client_id="01:bc:24:11:8a:42:01",
                    valid_lft=86400,
                    state="ativo"
                ),
                DhcpLeaseInfo(
                    ip_address="192.168.1.101",
                    mac_address="a4:83:e7:2b:19:90",
                    hostname="impressora-hp-laser",
                    expire_time="2026-10-15 18:45:00 UTC",
                    client_id="01:a4:83:e7:2b:19:90",
                    valid_lft=86400,
                    state="ativo"
                ),
                DhcpLeaseInfo(
                    ip_address="192.168.1.102",
                    mac_address="3c:22:fb:99:aa:12",
                    hostname="notebook-suporte",
                    expire_time="2026-10-16 09:15:00 UTC",
                    client_id="01:3c:22:fb:99:aa:12",
                    valid_lft=86400,
                    state="ativo"
                )
            ]

        return leases

dhcp_service = KeaDhcpService()
