import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import settings
from app.core.executor import CommandExecutor, TaskInfo, executor
from app.core.firewall_profiles import FIREWALL_PROFILES, PROFILE_DETAILS
from app.core.templates import write_and_backup
from app.models.firewall import (
    NatConfigRequest,
    NatStatusResponse,
    UfwAction,
    UfwDirection,
    UfwProtocol,
    UfwRuleCreate,
    UfwRuleItem,
    UfwStatus,
)


class FirewallService:
    """
    Serviço central de gestão do Firewall UFW e Roteamento/NAT no Ubuntu Server.
    """

    NAT_START_TAG = "# START SGLINUX NAT RULES"
    NAT_END_TAG = "# END SGLINUX NAT RULES"
    FORWARD_START_TAG = "# START SGLINUX FORWARD RULES"
    FORWARD_END_TAG = "# END SGLINUX FORWARD RULES"

    @property
    def before_rules_path(self) -> Path:
        return settings.UFW_BEFORE_RULES

    @property
    def default_ufw_path(self) -> Path:
        return settings.UFW_DEFAULT_CONFIG

    @property
    def sysctl_conf_path(self) -> Path:
        return settings.SYSCTL_IP_FORWARD_CONF

    def is_ufw_available(self) -> bool:
        if settings.SIMULATION_MODE:
            return True
        return shutil.which("ufw") is not None

    def parse_ufw_status(self, output: str) -> UfwStatus:
        """
        Interpreta a saída de 'ufw status numbered' ou 'ufw status verbose'.
        """
        active = "Status: active" in output
        default_incoming = "deny"
        default_outgoing = "allow"
        rules: List[UfwRuleItem] = []

        # Analisa padrões padrão (incoming/outgoing)
        m_inc = re.search(r"Default:\s+(\w+)\s+\(incoming\)", output)
        if m_inc:
            default_incoming = m_inc.group(1).lower()
        m_out = re.search(r"(\w+)\s+\(outgoing\)", output)
        if m_out:
            default_outgoing = m_out.group(1).lower()

        # Parse de regras numeradas
        # Exemplo:
        # [ 1] 22/tcp                     ALLOW IN    Anywhere
        # [ 2] 53                         ALLOW IN    192.168.1.0/24             # DNS BIND9
        rule_regex = re.compile(
            r"\[\s*(\d+)\]\s+([^\s]+(?:\s+\([^\)]+\))?)\s+(ALLOW IN|DENY IN|REJECT IN|LIMIT IN|ALLOW OUT|DENY OUT)\s+([^\s#]+)(?:\s+#\s*(.*))?"
        )

        for line in output.splitlines():
            match = rule_regex.search(line)
            if match:
                idx = int(match.group(1))
                to_val = match.group(2).strip()
                action_val = match.group(3).strip()
                from_val = match.group(4).strip()
                comment_val = match.group(5).strip() if match.group(5) else None

                rules.append(
                    UfwRuleItem(
                        index=idx,
                        to=to_val,
                        action=action_val,
                        from_ip=from_val,
                        comment=comment_val,
                    )
                )

        return UfwStatus(
            active=active,
            default_incoming=default_incoming,
            default_outgoing=default_outgoing,
            rules=rules,
        )

    def get_status(self) -> UfwStatus:
        """
        Retorna o estado do UFW e a lista de regras numeradas.
        """
        if settings.SIMULATION_MODE or not self.is_ufw_available():
            return UfwStatus(
                active=True,
                default_incoming="deny",
                default_outgoing="allow",
                rules=[
                    UfwRuleItem(index=1, to="22/tcp", action="ALLOW IN", from_ip="Anywhere", comment="OpenSSH Safe Access"),
                    UfwRuleItem(index=2, to="80/tcp", action="ALLOW IN", from_ip="Anywhere", comment="HTTP Web UI"),
                    UfwRuleItem(index=3, to="443/tcp", action="ALLOW IN", from_ip="Anywhere", comment="HTTPS Web UI"),
                    UfwRuleItem(index=4, to="53", action="ALLOW IN", from_ip="192.168.1.0/24", comment="DNS BIND9 / Samba"),
                    UfwRuleItem(index=5, to="67:68/udp", action="ALLOW IN", from_ip="Anywhere", comment="DHCP Kea Server"),
                    UfwRuleItem(index=6, to="88", action="ALLOW IN", from_ip="192.168.1.0/24", comment="Samba AD: Kerberos KDC"),
                    UfwRuleItem(index=7, to="389", action="ALLOW IN", from_ip="192.168.1.0/24", comment="Samba AD: LDAP"),
                    UfwRuleItem(index=8, to="445/tcp", action="ALLOW IN", from_ip="192.168.1.0/24", comment="Samba AD: SMB"),
                ],
            )

        try:
            cmd = ["ufw", "status", "numbered"]
            if os.geteuid() != 0:
                cmd = ["sudo"] + cmd
            result = subprocess.run(cmd, capture_output=True, text=True, check=False)
            return self.parse_ufw_status(result.stdout)
        except Exception as e:
            # Fallback seguro
            return UfwStatus(
                active=False,
                default_incoming="deny",
                default_outgoing="allow",
                rules=[],
            )

    def has_ssh_rule(self, status: Optional[UfwStatus] = None) -> bool:
        """
        Verifica se há regra de liberação de SSH (porta 22) para evitar lockout.
        """
        if status is None:
            status = self.get_status()

        for rule in status.rules:
            to_lower = rule.to.lower()
            if "22" in to_lower or "ssh" in to_lower:
                if "allow" in rule.action.lower():
                    return True
        return False

    def enable(self, safe_ssh: bool = True) -> TaskInfo:
        """
        Habilita o UFW garantindo previamente a liberação da porta SSH (22/tcp).
        """
        commands: List[str] = []

        if safe_ssh:
            # Garante que a porta 22 está liberada antes de ativar o firewall
            commands.append("ufw allow 22/tcp comment 'OpenSSH Safe Access'")

        commands.append("ufw --force enable")
        commands.append("systemctl enable ufw")

        if not settings.SIMULATION_MODE and os.geteuid() != 0:
            full_command = " && ".join([f"sudo {c}" for c in commands])
        else:
            full_command = " && ".join(commands)

        task = executor.run_command(
            command=full_command,
            description="Ativação do Firewall UFW com salvaguarda SSH"
        )
        return task

    def disable(self) -> TaskInfo:
        """
        Desabilita o firewall UFW.
        """
        cmd = ["ufw", "disable"]
        if not settings.SIMULATION_MODE and os.geteuid() != 0:
            cmd = ["sudo"] + cmd

        task = executor.run_command(
            command=cmd,
            description="Desativação do Firewall UFW"
        )
        return task

    def toggle(self, target_state: Optional[bool] = None) -> TaskInfo:
        """
        Alterna ou define o estado de ativação do UFW.
        """
        current_status = self.get_status()
        if target_state is None:
            target_state = not current_status.active

        if target_state:
            return self.enable(safe_ssh=True)
        else:
            return self.disable()

    def apply_profiles(self, profile_keys: List[str]) -> TaskInfo:
        """
        Aplica liberações de firewall para os perfis de infraestrutura informados.
        (ssh, dhcp, dns, samba_ad, etc).
        """
        commands: List[str] = []

        for pkey in profile_keys:
            key_clean = pkey.strip().lower()
            if key_clean not in FIREWALL_PROFILES:
                continue

            ports = FIREWALL_PROFILES[key_clean]
            meta = PROFILE_DETAILS.get(key_clean)
            comment = meta["name"] if meta else f"Perfil {key_clean}"
            # Remove aspas do comentário
            comment = comment.replace("'", "").replace('"', "")

            for port in ports:
                # porta pode ser "22/tcp", "67/udp", "49152:65535/tcp"
                commands.append(f"ufw allow {port} comment '{comment}'")

        if not commands:
            raise ValueError(f"Nenhum perfil válido informado. Disponíveis: {list(FIREWALL_PROFILES.keys())}")

        if not settings.SIMULATION_MODE and os.geteuid() != 0:
            full_command = " && ".join([f"sudo {c}" for c in commands])
        else:
            full_command = " && ".join(commands)

        task = executor.run_command(
            command=full_command,
            description=f"Aplicação de perfis de firewall: {', '.join(profile_keys)}"
        )
        return task

    def add_rule(self, rule: UfwRuleCreate) -> TaskInfo:
        """
        Adiciona uma regra personalizada usando lista segura de argumentos.
        """
        cmd_args = ["ufw", rule.action.value, rule.direction.value]

        if rule.protocol.value != "any":
            cmd_args.extend(["proto", rule.protocol.value])

        if rule.from_ip:
            cmd_args.extend(["from", rule.from_ip])
        else:
            cmd_args.extend(["from", "any"])

        to_addr = rule.to_ip or "any"
        cmd_args.extend(["to", to_addr, "port", rule.port])

        if rule.comment:
            clean_comment = rule.comment.replace('"', '').replace("'", "")
            cmd_args.extend(["comment", clean_comment])

        task = executor.run_command(
            command=cmd_args,
            description=f"Adição de regra UFW ({rule.action.value.upper()} {rule.port}/{rule.protocol.value})"
        )
        return task

    def delete_rule(self, rule_number: int) -> TaskInfo:
        """
        Exclui uma regra do UFW pelo seu índice numérico.
        """
        if rule_number < 1:
            raise ValueError("O índice da regra de firewall deve ser >= 1.")

        cmd_args = ["ufw", "--force", "delete", str(rule_number)]

        task = executor.run_command(
            command=cmd_args,
            description=f"Exclusão da regra UFW #{rule_number}"
        )
        return task

    def configure_nat(self, req: NatConfigRequest) -> Dict[str, Any]:
        """
        Configura o Roteamento e Compartilhamento de Internet (NAT / Masquerade):
        1. Ativa o encaminhamento de pacotes IPv4 no kernel:
           - sysctl -w net.ipv4.ip_forward=1 (ou 0 se desabilitando)
           - Grava em /etc/sysctl.d/99-ip-forward.conf
        2. Configura /etc/default/ufw:
           - DEFAULT_FORWARD_POLICY="ACCEPT"
        3. Configura regras NAT e FORWARD no /etc/ufw/before.rules
        4. Recarrega as regras do UFW:
           - ufw reload
        """
        wan = req.wan_interface.strip()
        lan = req.lan_interface.strip()
        enable = req.enabled
        subnet = req.lan_subnet.strip() if req.lan_subnet else None

        # 1. Configurar sysctl persistente em /etc/sysctl.d/99-ip-forward.conf
        sysctl_file = self.sysctl_conf_path
        sysctl_file.parent.mkdir(parents=True, exist_ok=True)
        sysctl_val = "1" if enable else "0"
        sysctl_content = (
            f"# Roteamento IPv4 gerenciado pelo SGLinux Gateway\n"
            f"net.ipv4.ip_forward={sysctl_val}\n"
        )
        write_and_backup(sysctl_file, sysctl_content)

        # 2. Configurar /etc/default/ufw para DEFAULT_FORWARD_POLICY="ACCEPT"
        default_ufw_file = self.default_ufw_path
        if default_ufw_file.exists():
            try:
                curr_default = default_ufw_file.read_text(encoding="utf-8")
                new_policy = 'DEFAULT_FORWARD_POLICY="ACCEPT"' if enable else 'DEFAULT_FORWARD_POLICY="DROP"'
                if 'DEFAULT_FORWARD_POLICY=' in curr_default:
                    updated_default = re.sub(
                        r'DEFAULT_FORWARD_POLICY=".*?"',
                        new_policy,
                        curr_default
                    )
                else:
                    updated_default = curr_default + f"\n{new_policy}\n"
                write_and_backup(default_ufw_file, updated_default)
            except Exception as e:
                pass
        elif settings.SIMULATION_MODE:
            default_ufw_file.parent.mkdir(parents=True, exist_ok=True)
            default_ufw_file.write_text(
                f'DEFAULT_FORWARD_POLICY="{"ACCEPT" if enable else "DROP"}"\n',
                encoding="utf-8"
            )

        # 3. Configurar /etc/ufw/before.rules
        before_file = self.before_rules_path
        self._update_before_rules(before_file, wan=wan, lan=lan, enable=enable, subnet=subnet)

        # 4. Executar comandos no sistema
        commands: List[str] = []
        if enable:
            commands.append(f"sysctl -w net.ipv4.ip_forward=1")
        else:
            commands.append(f"sysctl -w net.ipv4.ip_forward=0")

        commands.append("ufw reload")

        if not settings.SIMULATION_MODE and os.geteuid() != 0:
            full_cmd = " && ".join([f"sudo {c}" for c in commands])
        else:
            full_cmd = " && ".join(commands)

        task = executor.run_command(
            command=full_cmd,
            description=f"{'Ativação' if enable else 'Desativação'} de Roteamento Gateway e NAT (WAN: {wan}, LAN: {lan})"
        )

        return {
            "message": f"Roteamento e NAT {'ativados' if enable else 'desativados'} com sucesso.",
            "task_id": task.id,
            "wan_interface": wan,
            "lan_interface": lan,
            "lan_subnet": subnet,
            "enabled": enable,
            "log_file": task.log_file
        }

    def _update_before_rules(
        self,
        filepath: Path,
        wan: str,
        lan: str,
        enable: bool,
        subnet: Optional[str] = None
    ) -> None:
        """
        Adiciona ou remove o bloco NAT e regras de FORWARD em before.rules.
        """
        content = ""
        if filepath.exists():
            content = filepath.read_text(encoding="utf-8")
        else:
            # Conteúdo padrão básico do before.rules do Ubuntu
            content = (
                "#\n"
                "# rules.before\n"
                "#\n"
                "*filter\n"
                ":ufw-before-input - [0:0]\n"
                ":ufw-before-output - [0:0]\n"
                ":ufw-before-forward - [0:0]\n"
                ":ufw-not-local - [0:0]\n"
                "COMMIT\n"
            )

        # 1. Remover blocos anteriores do SGLinux se existirem
        nat_pattern = re.compile(
            rf"{re.escape(self.NAT_START_TAG)}.*?{re.escape(self.NAT_END_TAG)}\n?",
            re.DOTALL
        )
        content = nat_pattern.sub("", content)

        forward_pattern = re.compile(
            rf"{re.escape(self.FORWARD_START_TAG)}.*?{re.escape(self.FORWARD_END_TAG)}\n?",
            re.DOTALL
        )
        content = forward_pattern.sub("", content)

        # 2. Se estiver habilitando, construir os novos blocos
        if enable:
            # Bloco da tabela *nat
            postrouting_rule = f"-A POSTROUTING -o {wan} -j MASQUERADE"
            if subnet:
                postrouting_rule = f"-A POSTROUTING -s {subnet} -o {wan} -j MASQUERADE"

            nat_block = (
                f"{self.NAT_START_TAG}\n"
                f"*nat\n"
                f":POSTROUTING ACCEPT [0:0]\n"
                f"{postrouting_rule}\n"
                f"COMMIT\n"
                f"{self.NAT_END_TAG}\n\n"
            )

            # Insere a tabela *nat antes de *filter no início do arquivo
            if "*filter" in content:
                content = content.replace("*filter", f"{nat_block}*filter", 1)
            else:
                content = nat_block + content

            # Bloco de FORWARD dentro de *filter
            forward_block = (
                f"{self.FORWARD_START_TAG}\n"
                f"-A ufw-before-forward -i {lan} -o {wan} -j ACCEPT\n"
                f"-A ufw-before-forward -i {wan} -o {lan} -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT\n"
                f"{self.FORWARD_END_TAG}\n"
            )

            if "COMMIT" in content:
                # Insere antes do último COMMIT da tabela filter
                last_commit_idx = content.rfind("COMMIT")
                content = content[:last_commit_idx] + forward_block + content[last_commit_idx:]
            else:
                content += f"\n{forward_block}"

        # 3. Salva com backup
        write_and_backup(filepath, content)

    def get_nat_status(self) -> NatStatusResponse:
        """
        Inspeciona o estado atual do roteamento IPv4 e NAT no sistema.
        """
        ip_forwarding = False
        nat_configured = False
        wan_iface: Optional[str] = None
        lan_iface: Optional[str] = None
        lan_subnet: Optional[str] = None

        # 1. Verifica ip_forwarding via sysctl ou proc
        if settings.SIMULATION_MODE:
            # Lê do mock se existir
            sysctl_file = self.sysctl_conf_path
            if sysctl_file.exists():
                txt = sysctl_file.read_text(encoding="utf-8")
                if "net.ipv4.ip_forward=1" in txt:
                    ip_forwarding = True
            else:
                ip_forwarding = True  # Padrão demonstrativo na simulação
        else:
            try:
                proc = subprocess.run(
                    ["sysctl", "-n", "net.ipv4.ip_forward"],
                    capture_output=True,
                    text=True,
                    check=False
                )
                if proc.stdout.strip() == "1":
                    ip_forwarding = True
            except Exception:
                pass

        # 2. Inspeciona /etc/ufw/before.rules para extrair interfaces
        before_file = self.before_rules_path
        if before_file.exists():
            try:
                txt = before_file.read_text(encoding="utf-8")
                if self.NAT_START_TAG in txt and "MASQUERADE" in txt:
                    nat_configured = True
                    # Extrai interface WAN (-o <iface>)
                    m_wan = re.search(r"-o\s+([a-zA-Z0-9_\-\.]+)\s+-j\s+MASQUERADE", txt)
                    if m_wan:
                        wan_iface = m_wan.group(1)

                    # Extrai subnet opcional (-s <subnet>)
                    m_sub = re.search(r"-s\s+([0-9\.\/]+)\s+-o", txt)
                    if m_sub:
                        lan_subnet = m_sub.group(1)

                    # Extrai interface LAN (-i <lan> -o <wan>)
                    m_lan = re.search(r"-A\s+ufw-before-forward\s+-i\s+([a-zA-Z0-9_\-\.]+)\s+-o", txt)
                    if m_lan:
                        lan_iface = m_lan.group(1)
            except Exception:
                pass
        elif settings.SIMULATION_MODE and ip_forwarding:
            # Demonstração padrão em simulação
            nat_configured = True
            wan_iface = "eth0"
            lan_iface = "eth1"
            lan_subnet = "192.168.1.0/24"

        enabled = ip_forwarding and nat_configured

        return NatStatusResponse(
            enabled=enabled,
            ip_forwarding=ip_forwarding,
            wan_interface=wan_iface,
            lan_interface=lan_iface,
            lan_subnet=lan_subnet,
            details=f"Gateway NAT {'ativo' if enabled else 'inativo'} (WAN: {wan_iface or 'n/a'}, LAN: {lan_iface or 'n/a'})"
        )


firewall_service = FirewallService()
