import asyncio
import ipaddress
from ipaddress import IPv4Address, IPv4Interface, IPv4Network
import json
import logging
import os
import re
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import WebSocket

from app.core.config import settings
from app.core.firewall_profiles import FIREWALL_PROFILES
from app.core.templates import render_netplan, render_samba, write_and_backup
from app.models.network import EthernetInterface, NameserverConfig, NetplanConfig
from app.models.samba import DnsBackendType, SambaProvisionRequest
from app.schemas import DhcpConfigRequest, WizardSetupRequest
from app.services.dhcp import dhcp_service
from app.services.firewall import firewall_service

logger = logging.getLogger("sglinux.wizard")

ANSI_ESCAPE_RE = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')

def strip_ansi(text: str) -> str:
    return ANSI_ESCAPE_RE.sub('', text)


class WizardOrchestrator:
    """
    Orquestrador Unificado do Setup Wizard para configuração completa e contínua
    de servidores Ubuntu Server:
    Sequência:
      1. Rede & Netplan + Desativação de Stub Listener no systemd-resolved (Porta 53 livre)
      2. Samba 4 Active Directory Domain Controller (AD DC)
      3. ISC Kea DHCPv4 (com DNS apontando automaticamente para o servidor AD DC)
      4. Firewall UFW (SSH garantido + perfis Samba AD + DHCP + DNS)
    """

    def __init__(self, request: WizardSetupRequest, websocket: Optional[WebSocket] = None):
        self.request = request
        self.websocket = websocket
        self.wizard_id = str(uuid.uuid4())[:8]
        self.cancelled = False

        # Arquivo de log de auditoria dedicado
        self.log_file = settings.LOG_DIR / f"wizard_{self.wizard_id}.log"
        self._init_log_file()

    def _init_log_file(self):
        try:
            self.log_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.log_file, "w", encoding="utf-8") as f:
                f.write(
                    f"================================================================================\n"
                    f"SGLinux - Setup Wizard Audit Log\n"
                    f"ID da Sessão: {self.wizard_id}\n"
                    f"Data/Hora UTC: {datetime.utcnow().isoformat()}\n"
                    f"Interface: {self.request.network_interface}\n"
                    f"IP do Servidor: {self.request.server_ip_cidr}\n"
                    f"Realm AD: {self.request.realm} (Domínio: {self.request.domain})\n"
                    f"DHCP Ativo: {self.request.enable_dhcp}\n"
                    f"Firewall Ativo: {self.request.enable_firewall}\n"
                    f"Modo Simulação: {settings.SIMULATION_MODE}\n"
                    f"================================================================================\n\n"
                )
        except Exception as e:
            logger.error(f"Erro ao inicializar log do wizard {self.log_file}: {e}")

    async def log(self, text: str, stream: str = "stdout"):
        """Grava log no arquivo de auditoria e transmite via WebSocket formatado com timestamp."""
        timestamp = datetime.utcnow().strftime("%H:%M:%S")
        prefix = f"\x1b[90m[{timestamp}]\x1b[0m "
        if stream == "stderr":
            formatted = f"{prefix}\x1b[31m[ERRO]\x1b[0m {text}"
        else:
            formatted = f"{prefix}{text}"

        # Escreve em disco limpo
        try:
            with open(self.log_file, "a", encoding="utf-8") as f:
                f.write(f"{strip_ansi(formatted)}\n")
        except Exception:
            pass

        # Transmite via WebSocket
        if self.websocket:
            try:
                await self.websocket.send_json({
                    "type": "log",
                    "stream": stream,
                    "data": formatted,
                    "raw": text
                })
            except Exception:
                pass

    async def send_progress(
        self,
        percent: int,
        step: int,
        total_steps: int,
        step_name: str,
        status: str = "running"
    ):
        """Notifica o progresso da etapa via WebSocket."""
        if self.websocket:
            try:
                await self.websocket.send_json({
                    "type": "progress",
                    "percent": percent,
                    "step": step,
                    "total_steps": total_steps,
                    "step_name": step_name,
                    "status": status
                })
            except Exception:
                pass

    async def send_error(self, message: str, step: int):
        """Envia mensagem de erro com término de fluxo."""
        await self.log(f"\x1b[1;31m✘ ERRO CRÍTICO NA ETAPA {step}/4: {message}\x1b[0m", stream="stderr")
        if self.websocket:
            try:
                await self.websocket.send_json({
                    "type": "error",
                    "step": step,
                    "message": message
                })
            except Exception:
                pass

    async def send_completed(self, summary: Dict[str, Any]):
        """Notifica a finalização com sucesso de todas as etapas."""
        if self.websocket:
            try:
                await self.websocket.send_json({
                    "type": "completed",
                    "percent": 100,
                    "message": "Provisionamento do Servidor concluído com sucesso!",
                    "summary": summary
                })
            except Exception:
                pass

    async def run_command(self, cmd_args: List[str], desc: str) -> bool:
        """
        Executa comando de sistema via subprocess_exec de forma assíncrona,
        transmitindo cada linha do stdout/stderr para o WebSocket.
        """
        if self.cancelled:
            return False

        cmd_display = " ".join(cmd_args)
        await self.log(f"\x1b[1;36m▶ {desc}\x1b[0m")
        await self.log(f"\x1b[90m$ {cmd_display}\x1b[0m")

        if settings.SIMULATION_MODE:
            await asyncio.sleep(0.4)
            await self.log(f"\x1b[33m[MODO SIMULAÇÃO]\x1b[0m Execução simulada com sucesso.")
            return True

        try:
            exec_args = list(cmd_args)
            if os.geteuid() != 0:
                exec_args = ["sudo"] + exec_args

            proc = await asyncio.create_subprocess_exec(
                *exec_args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=os.environ.copy()
            )

            async def stream_output(stream, stream_name):
                while True:
                    line = await stream.readline()
                    if not line:
                        break
                    decoded = line.decode("utf-8", errors="replace").rstrip("\r\n")
                    await self.log(decoded, stream=stream_name)

            await asyncio.gather(
                stream_output(proc.stdout, "stdout"),
                stream_output(proc.stderr, "stderr")
            )

            await proc.wait()
            if proc.returncode == 0:
                await self.log(f"\x1b[32m✔ Sucesso (código 0)\x1b[0m")
                return True
            else:
                await self.log(f"\x1b[31m✘ Falha: processo retornou código {proc.returncode}\x1b[0m", stream="stderr")
                return False

        except Exception as e:
            await self.log(f"\x1b[31m✘ Falha ao executar comando: {e}\x1b[0m", stream="stderr")
            return False

    async def execute(self) -> bool:
        """
        Ponto de entrada do orquestrador.
        Executa sequencialmente as 4 etapas com interrupção imediata em caso de falha.
        """
        try:
            # Banner inicial
            await self.log("\x1b[1;35m╔═════════════════════════════════════════════════════════════════════════════╗\x1b[0m")
            await self.log("\x1b[1;35m║           SGLINUX — ASSISTENTE DE PROVISIONAMENTO UNIFICADO                 ║\x1b[0m")
            await self.log("\x1b[1;35m║           Sequência: Rede → Samba AD DC → Kea DHCP → Firewall UFW           ║\x1b[0m")
            await self.log("\x1b[1;35m╚═════════════════════════════════════════════════════════════════════════════╝\x1b[0m\r\n")

            iface = IPv4Interface(self.request.server_ip_cidr)
            server_ip = str(iface.ip)
            server_net = str(iface.network)

            # -------------------------------------------------------------
            # ETAPA 1/4: Rede, Netplan & Desativação do systemd-resolved stub
            # -------------------------------------------------------------
            await self.send_progress(5, 1, 4, "Etapa 1/4: Aplicando Netplan e liberando a porta 53")
            await self.log(f"\x1b[1;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m")
            await self.log(f"\x1b[1;34m[ETAPA 1/4] Configuração de Rede & Netplan ({self.request.network_interface})\x1b[0m")
            await self.log(f"IP Estático: {server_ip} | Sub-rede: {server_net}")
            if self.request.gateway:
                await self.log(f"Gateway: {self.request.gateway}")
            await self.log(f"DNS Upstream: {', '.join(str(d) for d in self.request.upstream_dns)}")

            # 1.1 Renderizar e salvar Netplan preservando interfaces já existentes
            ethernets_dict = load_existing_ethernets()
            ethernets_dict[self.request.network_interface] = EthernetInterface(
                name=self.request.network_interface,
                dhcp4=False,
                addresses=[self.request.server_ip_cidr],
                gateway4=str(self.request.gateway) if self.request.gateway else None,
                nameservers=NameserverConfig(
                    addresses=[str(d) for d in self.request.upstream_dns]
                )
            )
            netplan_obj = NetplanConfig(
                renderer="networkd",
                ethernets=ethernets_dict
            )
            netplan_yaml = render_netplan(netplan_obj)
            write_and_backup(settings.NETPLAN_FILE, netplan_yaml)
            await self.log(f"Arquivo Netplan gravado com sucesso em {settings.NETPLAN_FILE}")

            # 1.2 Desativar stub listener da porta 53 no systemd-resolved para liberar para o Samba
            await self.log("Liberando a porta 53: desativando DNSStubListener no systemd-resolved...")
            if not settings.SIMULATION_MODE:
                resolved_dropin = Path("/etc/systemd/resolved.conf.d/sglinux-disable-stub.conf")
                resolved_dropin.parent.mkdir(parents=True, exist_ok=True)
                resolved_dropin.write_text("[Resolve]\nDNSStubListener=no\n", encoding="utf-8")
                
                # Reiniciar resolved
                ok_resolved = await self.run_command(
                    ["systemctl", "restart", "systemd-resolved"],
                    "Reiniciando systemd-resolved sem stub listener na porta 53"
                )
                if not ok_resolved:
                    await self.send_error("Falha ao desativar stub listener do systemd-resolved na porta 53.", 1)
                    return False
            else:
                await self.log("[MODO SIMULAÇÃO] systemd-resolved stub listener desativado virtualmente.")

            # 1.3 Aplicar Netplan
            ok_netplan = await self.run_command(
                ["netplan", "apply"],
                f"Aplicando Netplan na interface {self.request.network_interface}"
            )
            if not ok_netplan:
                await self.send_error("Falha na execução de 'netplan apply'. Fluxo interrompido.", 1)
                return False

            await self.send_progress(25, 1, 4, "Etapa 1/4 concluída: Rede configurada com sucesso!")
            await self.log("\x1b[1;32m✔ Etapa 1/4 Concluída com sucesso!\x1b[0m\r\n")

            # -------------------------------------------------------------
            # ETAPA 2/4: Samba 4 Active Directory Domain Controller (AD DC)
            # -------------------------------------------------------------
            await self.send_progress(30, 2, 4, "Etapa 2/4: Instalação e Provisionamento do Samba 4 AD DC")
            await self.log(f"\x1b[1;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m")
            await self.log(f"\x1b[1;34m[ETAPA 2/4] Provisionamento do Samba 4 AD DC ({self.request.realm})\x1b[0m")
            await self.log(f"Realm: {self.request.realm} | Domínio NetBIOS: {self.request.domain}")

            # 2.1 Instalação de pacotes se necessário
            if not settings.SIMULATION_MODE:
                ok_pkg = await self.run_command(
                    [
                        "apt-get", "install", "-y", "-q",
                        "-o", "Dpkg::Options::=--force-confdef",
                        "-o", "Dpkg::Options::=--force-confold",
                        "samba", "krb5-user", "winbind", "smbclient"
                    ],
                    "Instalando pacotes do Samba 4 e Kerberos"
                )
                if not ok_pkg:
                    await self.send_error("Falha na instalação dos pacotes do Samba 4 AD DC.", 2)
                    return False

                # Desativar serviços legado do Samba
                await self.run_command(
                    ["systemctl", "stop", "smbd", "nmbd", "winbind"],
                    "Parando serviços legado smbd, nmbd e winbind"
                )
                await self.run_command(
                    ["systemctl", "disable", "smbd", "nmbd", "winbind"],
                    "Desabilitando serviços legado smbd, nmbd e winbind"
                )
                await self.run_command(
                    ["systemctl", "mask", "smbd", "nmbd", "winbind"],
                    "Mascarando serviços legado"
                )
                await self.run_command(
                    ["systemctl", "unmask", "samba-ad-dc"],
                    "Desmascarando serviço samba-ad-dc"
                )

                # Backup e limpeza do smb.conf antigo para permitir provision
                smb_conf = Path("/etc/samba/smb.conf")
                if smb_conf.exists():
                    backup_conf = Path(f"/etc/samba/smb.conf.bak-{datetime.now().strftime('%Y%m%d%H%M%S')}")
                    shutil.move(smb_conf, backup_conf)
                    await self.log(f"Backup de smb.conf anterior para {backup_conf}")

                # Limpar base sam.ldb se existir
                if settings.SAMBA_SAM_LDB.exists():
                    await self.log(f"Removendo base de dados anterior em {settings.SAMBA_SAM_LDB}...")
                    try:
                        settings.SAMBA_SAM_LDB.unlink()
                    except Exception as e:
                        logger.warning(f"Não foi possível remover sam.ldb: {e}")

            # 2.2 Provisionamento com samba-tool
            dns_forwarders_list = [str(d) for d in self.request.upstream_dns] if self.request.upstream_dns else ["8.8.8.8"]
            dns_forwarder_arg = " ".join(dns_forwarders_list)
            cmd_provision = [
                "samba-tool", "domain", "provision",
                f"--realm={self.request.realm}",
                f"--domain={self.request.domain}",
                f"--adminpass={self.request.admin_password}",
                "--server-role=dc",
                "--dns-backend=SAMBA_INTERNAL",
                "--use-rfc2307",
                f"--option=dns forwarder={dns_forwarder_arg}"
            ]

            ok_prov = await self.run_command(cmd_provision, "Executando provisionamento com samba-tool")
            if not ok_prov:
                await self.send_error("Falha no provisionamento do Samba 4 AD DC com samba-tool.", 2)
                return False

            # Em modo simulação, gravar mock smb.conf e sam.ldb
            if settings.SIMULATION_MODE:
                mock_samba_req = SambaProvisionRequest(
                    realm=self.request.realm,
                    domain=self.request.domain,
                    admin_password=self.request.admin_password,
                    dns_backend=DnsBackendType.SAMBA_INTERNAL,
                    dns_forwarder=dns_forwarder_arg,
                    server_role="dc",
                    force=True
                )
                conf_text = render_samba(mock_samba_req)
                write_and_backup(settings.SAMBA_CONF_FILE, conf_text)
                settings.SAMBA_SAM_LDB.parent.mkdir(parents=True, exist_ok=True)
                settings.SAMBA_SAM_LDB.write_text("# Mock SAM LDB", encoding="utf-8")

            # 2.3 Configurar Kerberos (/etc/krb5.conf)
            await self.log("Configurando arquivo Kerberos /etc/krb5.conf...")
            krb5_source = Path("/var/lib/samba/private/krb5.conf")
            krb5_dest = Path("/etc/krb5.conf")
            if not settings.SIMULATION_MODE and krb5_source.exists():
                try:
                    if krb5_dest.exists():
                        shutil.copy2(krb5_dest, Path("/etc/krb5.conf.bak"))
                    shutil.copy2(krb5_source, krb5_dest)
                    await self.log("Cópia de /var/lib/samba/private/krb5.conf para /etc/krb5.conf realizada.")
                except Exception as e:
                    await self.log(f"Aviso ao copiar krb5.conf: {e}", stream="stderr")

            # 2.4 Ativar e iniciar serviço samba-ad-dc
            ok_samba_svc = await self.run_command(
                ["systemctl", "enable", "--now", "samba-ad-dc"],
                "Habilitando e iniciando serviço samba-ad-dc"
            )
            if not ok_samba_svc:
                await self.send_error("Falha ao iniciar serviço samba-ad-dc via systemctl.", 2)
                return False

            await self.send_progress(50, 2, 4, "Etapa 2/4 concluída: Samba 4 AD DC ativo e operacional!")
            await self.log("\x1b[1;32m✔ Etapa 2/4 Concluída com sucesso!\x1b[0m\r\n")

            # -------------------------------------------------------------
            # ETAPA 3/4: Servidor DHCP (ISC Kea DHCPv4)
            # -------------------------------------------------------------
            if self.request.enable_dhcp:
                await self.send_progress(55, 3, 4, "Etapa 3/4: Configuração e Inicialização do Kea DHCPv4")
                await self.log(f"\x1b[1;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m")
                await self.log(f"\x1b[1;34m[ETAPA 3/4] Configuração do Servidor Kea DHCPv4 ({self.request.network_interface})\x1b[0m")
                await self.log(f"Faixa de Distribuição: {self.request.dhcp_pool_start} a {self.request.dhcp_pool_end}")
                await self.log(f"DNS dos Clientes: {server_ip} (Apontado para o AD DC deste servidor)")

                # 3.1 Instalar kea-dhcp4-server se necessário
                if not settings.SIMULATION_MODE and not dhcp_service.is_installed():
                    ok_dhcp_pkg = await self.run_command(
                        ["apt-get", "install", "-y", "kea-dhcp4-server"],
                        "Instalando pacote kea-dhcp4-server"
                    )
                    if not ok_dhcp_pkg:
                        await self.send_error("Falha ao instalar pacote kea-dhcp4-server.", 3)
                        return False

                # 3.2 Montar requisição do Kea DHCP
                # REQUISITO CRÍTICO: Utilizar automaticamente o server_ip da Etapa 1 como DNS distribuído aos clientes!
                dhcp_req = DhcpConfigRequest(
                    interface=self.request.network_interface,
                    subnet=server_net,
                    pool_start=self.request.dhcp_pool_start,
                    pool_end=self.request.dhcp_pool_end,
                    routers=[self.request.gateway] if self.request.gateway else [IPv4Address(server_ip)],
                    dns_servers=[IPv4Address(server_ip)],
                    lease_time=self.request.lease_time
                )

                # 3.3 Gerar arquivo /etc/kea/kea-dhcp4.conf
                conf_dict = dhcp_service.generate_config_dict(dhcp_req)
                conf_json = json.dumps(conf_dict, indent=2)
                write_and_backup(settings.KEA_CONF_FILE, conf_json)
                await self.log(f"Configuração do Kea gravada em {settings.KEA_CONF_FILE}")

                # 3.4 Validar sintaxe com kea-dhcp4 -t
                if not settings.SIMULATION_MODE:
                    ok_test = await self.run_command(
                        ["kea-dhcp4", "-t", str(settings.KEA_CONF_FILE)],
                        "Validando sintaxe do arquivo kea-dhcp4.conf com 'kea-dhcp4 -t'"
                    )
                    if not ok_test:
                        await self.send_error("Sintaxe inválida detectada no kea-dhcp4.conf.", 3)
                        return False

                # 3.5 Iniciar serviço kea-dhcp4-server
                ok_dhcp_svc = await self.run_command(
                    ["systemctl", "enable", "--now", "kea-dhcp4-server"],
                    "Habilitando e iniciando serviço kea-dhcp4-server"
                )
                if not ok_dhcp_svc:
                    await self.send_error("Falha ao iniciar o serviço kea-dhcp4-server.", 3)
                    return False

                await self.send_progress(75, 3, 4, "Etapa 3/4 concluída: Kea DHCPv4 ativo e distribuindo IPs!")
                await self.log("\x1b[1;32m✔ Etapa 3/4 Concluída com sucesso!\x1b[0m\r\n")
            else:
                await self.log("\x1b[90m[ETAPA 3/4] Configuração de DHCP desativada pelo utilizador. Ignorando...\x1b[0m")
                await self.send_progress(75, 3, 4, "Etapa 3/4 ignorada: Servidor DHCP não selecionado.")

            # -------------------------------------------------------------
            # ETAPA 4/4: Firewall UFW
            # -------------------------------------------------------------
            if self.request.enable_firewall:
                await self.send_progress(80, 4, 4, "Etapa 4/4: Configuração de Regras e Ativação do UFW")
                await self.log(f"\x1b[1;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m")
                await self.log(f"\x1b[1;34m[ETAPA 4/4] Aplicação de Segurança Perimetral com Firewall UFW\x1b[0m")

                # 4.1 Garantir liberação do SSH (22/tcp)
                await self.log("Liberando acesso à porta SSH (22/tcp) para proteção contra lockout...")
                ok_ssh = await self.run_command(
                    ["ufw", "allow", "22/tcp", "comment", "SSH Safe Access"],
                    "Liberando porta 22/tcp no UFW"
                )
                if not ok_ssh:
                    await self.send_error("Falha ao liberar porta 22 (SSH) no UFW.", 4)
                    return False

                # 4.2 Liberar portas do Samba 4 AD DC
                await self.log("Liberando portas do Samba 4 Active Directory Domain Controller...")
                samba_ports = FIREWALL_PROFILES.get("samba_ad", [])
                for port_spec in samba_ports:
                    await self.run_command(
                        ["ufw", "allow", port_spec, "comment", "Samba 4 AD DC"],
                        f"Liberando porta AD: {port_spec}"
                    )

                # 4.3 Se DHCP ativado, liberar portas DHCP
                if self.request.enable_dhcp:
                    await self.log("Liberando portas do Servidor DHCP (67/udp, 68/udp)...")
                    for dhcp_p in FIREWALL_PROFILES.get("dhcp", ["67/udp", "68/udp"]):
                        await self.run_command(
                            ["ufw", "allow", dhcp_p, "comment", "Kea DHCP Server"],
                            f"Liberando porta DHCP: {dhcp_p}"
                        )

                # 4.4 Liberar portas de DNS
                await self.log("Liberando portas do Servidor DNS (53/tcp, 53/udp)...")
                for dns_p in FIREWALL_PROFILES.get("dns", ["53/tcp", "53/udp"]):
                    await self.run_command(
                        ["ufw", "allow", dns_p, "comment", "DNS Server"],
                        f"Liberando porta DNS: {dns_p}"
                    )

                # 4.5 Ativar UFW com force
                ok_ufw_enable = await self.run_command(
                    ["ufw", "--force", "enable"],
                    "Ativando o Firewall UFW ('ufw --force enable')"
                )
                if not ok_ufw_enable:
                    await self.send_error("Falha ao ativar o firewall UFW.", 4)
                    return False

                # Recarregar regras
                await self.run_command(["ufw", "reload"], "Recarregando regras ativas do UFW")

                await self.send_progress(100, 4, 4, "Etapa 4/4 concluída: Firewall UFW ativo e protegido!")
                await self.log("\x1b[1;32m✔ Etapa 4/4 Concluída com sucesso!\x1b[0m\r\n")
            else:
                await self.log("\x1b[90m[ETAPA 4/4] Ativação de Firewall ignorada pelo utilizador.\x1b[0m")
                await self.send_progress(100, 4, 4, "Etapa 4/4 ignorada: Firewall desativado.")

            # -------------------------------------------------------------
            # Finalização com Sucesso
            # -------------------------------------------------------------
            summary = {
                "server_ip": server_ip,
                "server_ip_cidr": self.request.server_ip_cidr,
                "interface": self.request.network_interface,
                "realm": self.request.realm,
                "domain": self.request.domain,
                "dhcp_enabled": self.request.enable_dhcp,
                "dhcp_range": f"{self.request.dhcp_pool_start} - {self.request.dhcp_pool_end}" if self.request.enable_dhcp else "N/A",
                "firewall_enabled": self.request.enable_firewall,
                "log_file": str(self.log_file)
            }

            await self.log("\x1b[1;32m╔═════════════════════════════════════════════════════════════════════════════╗\x1b[0m")
            await self.log("\x1b[1;32m║                  PROVISIONAMENTO CONCLUÍDO COM SUCESSO!                     ║\x1b[0m")
            await self.log(f"\x1b[1;32m║ IP do Servidor : {server_ip:<58} ║\x1b[0m")
            await self.log(f"\x1b[1;32m║ Realm AD       : {self.request.realm:<58} ║\x1b[0m")
            await self.log(f"\x1b[1;32m║ Domínio NetBIOS: {self.request.domain:<58} ║\x1b[0m")
            await self.log(f"\x1b[1;32m║ Servidor DHCP  : {'Ativo e configurado' if self.request.enable_dhcp else 'Desativado':<58} ║\x1b[0m")
            await self.log(f"\x1b[1;32m║ Firewall UFW   : {'Ativo e seguro' if self.request.enable_firewall else 'Desativado':<58} ║\x1b[0m")
            await self.log("\x1b[1;32m╚═════════════════════════════════════════════════════════════════════════════╝\x1b[0m\r\n")

            await self.send_completed(summary)
            return True

        except Exception as e:
            logger.exception(f"Erro fatal na orquestração: {e}")
            await self.send_error(f"Exceção inesperada: {str(e)}", 0)
            return False
