import asyncio
import json
import logging
import os
import re
import shlex
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, TextIO, Union
from fastapi import WebSocket

from app.core.config import settings
from app.models.task import TaskInfo, TaskStatus

logger = logging.getLogger("sglinux.executor")

ANSI_ESCAPE_RE = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')

def strip_ansi(text: str) -> str:
    """Remove códigos de escape ANSI para gravação limpa em arquivo de log."""
    return ANSI_ESCAPE_RE.sub('', text)

class CommandExecutor:
    def __init__(self):
        self.tasks: Dict[str, TaskInfo] = {}
        self.subscribers: Dict[str, Set[WebSocket]] = {}
        self.global_subscribers: Set[WebSocket] = set()
        self.running_processes: Dict[str, asyncio.subprocess.Process] = {}
        self.log_handles: Dict[str, TextIO] = {}

    def get_task(self, task_id: str) -> Optional[TaskInfo]:
        return self.tasks.get(task_id)

    def list_tasks(self, limit: int = 50) -> List[TaskInfo]:
        sorted_tasks = sorted(self.tasks.values(), key=lambda t: t.created_at, reverse=True)
        return sorted_tasks[:limit]

    async def register_subscriber(self, websocket: WebSocket, task_id: Optional[str] = None):
        if task_id:
            if task_id not in self.subscribers:
                self.subscribers[task_id] = set()
            self.subscribers[task_id].add(websocket)
            
            # Send current status
            task = self.tasks.get(task_id)
            if task:
                await websocket.send_json({
                    "type": "status",
                    "task_id": task.id,
                    "status": task.status.value,
                    "exit_code": task.exit_code,
                    "command": task.command,
                    "description": task.description,
                    "log_file": task.log_file
                })
                # Replay logs
                for log_line in task.logs:
                    await websocket.send_json({
                        "type": "log",
                        "task_id": task.id,
                        "data": log_line
                    })
        else:
            self.global_subscribers.add(websocket)

    def unregister_subscriber(self, websocket: WebSocket, task_id: Optional[str] = None):
        if task_id and task_id in self.subscribers:
            self.subscribers[task_id].discard(websocket)
            if not self.subscribers[task_id]:
                del self.subscribers[task_id]
        self.global_subscribers.discard(websocket)

    async def broadcast_log(self, task_id: str, stream: str, data: str):
        task = self.tasks.get(task_id)
        if not task:
            return

        timestamp = datetime.utcnow().strftime("%H:%M:%S")
        prefix = f"\x1b[90m[{timestamp}]\x1b[0m "
        if stream == "stderr":
            formatted = f"{prefix}\x1b[31m[STDERR]\x1b[0m {data}"
        else:
            formatted = f"{prefix}{data}"

        task.logs.append(formatted)

        # Write clean line to dedicated disk log file
        log_handle = self.log_handles.get(task_id)
        if log_handle and not log_handle.closed:
            try:
                clean_line = strip_ansi(formatted)
                log_handle.write(f"{clean_line}\n")
                log_handle.flush()
            except Exception as e:
                logger.error(f"Erro ao escrever no log em disco da tarefa {task_id}: {e}")

        msg = {
            "type": "log",
            "task_id": task_id,
            "stream": stream,
            "data": formatted,
            "raw": data
        }

        # Broadcast to task subscribers
        target_ws = set()
        if task_id in self.subscribers:
            target_ws.update(self.subscribers[task_id])
        target_ws.update(self.global_subscribers)

        dead_ws = []
        for ws in target_ws:
            try:
                await ws.send_json(msg)
            except Exception:
                dead_ws.append(ws)

        for ws in dead_ws:
            self.unregister_subscriber(ws, task_id)

    async def broadcast_status(self, task: TaskInfo):
        msg = {
            "type": "status",
            "task_id": task.id,
            "status": task.status.value,
            "exit_code": task.exit_code,
            "command": task.command,
            "description": task.description,
            "log_file": task.log_file
        }

        target_ws = set()
        if task.id in self.subscribers:
            target_ws.update(self.subscribers[task.id])
        target_ws.update(self.global_subscribers)

        for ws in target_ws:
            try:
                await ws.send_json(msg)
            except Exception:
                pass

    def run_command(
        self,
        command: Union[List[str], str],
        description: str,
        simulate: Optional[bool] = None
    ) -> TaskInfo:
        """
        Executa comando em background passando argumentos como lista para subprocess_exec,
        salvando cada execução em arquivo dedicado de log para auditoria.
        """
        task_id = str(uuid.uuid4())[:8]

        # Normalizar argumentos para lista de strings
        if isinstance(command, list):
            command_args = [str(arg) for arg in command]
            command_str = shlex.join(command_args)
        else:
            command_str = command
            command_args = shlex.split(command)

        # Arquivo de log dedicado: /var/log/sysmanager/install_<job_id>.log
        log_dir = settings.LOG_DIR
        log_path = log_dir / f"install_{task_id}.log"

        task = TaskInfo(
            id=task_id,
            command=command_str,
            command_args=command_args,
            description=description,
            status=TaskStatus.PENDING,
            log_file=str(log_path)
        )
        self.tasks[task_id] = task

        # Inicializar arquivo de log em disco
        try:
            handle = open(log_path, "w", encoding="utf-8")
            self.log_handles[task_id] = handle
            handle.write(
                f"================================================================================\n"
                f"SGLinux Audit Log - Execução de Comando de Sistema\n"
                f"ID da Tarefa: {task_id}\n"
                f"Data/Hora UTC: {datetime.utcnow().isoformat()}\n"
                f"Descrição: {description}\n"
                f"Comando Formatado: {command_str}\n"
                f"Argumentos da Lista: {json.dumps(command_args, ensure_ascii=False)}\n"
                f"Arquivo de Log: {log_path}\n"
                f"================================================================================\n\n"
            )
            handle.flush()
        except Exception as e:
            logger.error(f"Não foi possível abrir o arquivo de log {log_path}: {e}")

        is_sim = simulate if simulate is not None else settings.SIMULATION_MODE
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self._execute(task_id, command_args, is_sim))
        except RuntimeError:
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(self._execute(task_id, command_args, is_sim))
                else:
                    asyncio.ensure_future(self._execute(task_id, command_args, is_sim))
            except Exception:
                pass
        return task

    async def cancel_task(self, task_id: str) -> bool:
        task = self.tasks.get(task_id)
        if not task or task.status not in (TaskStatus.PENDING, TaskStatus.RUNNING):
            return False

        proc = self.running_processes.get(task_id)
        if proc:
            try:
                proc.terminate()
                await asyncio.sleep(0.5)
                if proc.returncode is None:
                    proc.kill()
            except ProcessLookupError:
                pass

        task.status = TaskStatus.CANCELLED
        task.completed_at = datetime.utcnow()
        await self.broadcast_log(task_id, "stderr", "\r\n\x1b[33m[!] Tarefa cancelada pelo utilizador.\x1b[0m\r\n")
        await self._finalize_task(task_id)
        return True

    async def _execute(self, task_id: str, command_args: List[str], simulate: bool):
        task = self.tasks[task_id]
        task.status = TaskStatus.RUNNING
        task.started_at = datetime.utcnow()
        await self.broadcast_status(task)

        await self.broadcast_log(task_id, "stdout", f"\x1b[1;36m▶ Iniciando: {task.description}\x1b[0m")
        await self.broadcast_log(task_id, "stdout", f"\x1b[90m$ {task.command}\x1b[0m")
        if task.log_file:
            await self.broadcast_log(task_id, "stdout", f"\x1b[90m[Arquivo de auditoria: {task.log_file}]\x1b[0m\r\n")

        if simulate:
            await self._simulate_command(task_id, command_args)
            return

        try:
            # Construir lista segura para exec (sem shell injection)
            exec_args = list(command_args)
            if not settings.SIMULATION_MODE and os.geteuid() != 0:
                exec_args = ["sudo"] + exec_args

            # Execução segura através de subprocess_exec com lista de argumentos
            process = await asyncio.create_subprocess_exec(
                *exec_args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=os.environ.copy()
            )
            self.running_processes[task_id] = process

            async def read_stream(stream, name):
                while True:
                    line = await stream.readline()
                    if not line:
                        break
                    decoded = line.decode("utf-8", errors="replace").rstrip("\r\n")
                    await self.broadcast_log(task_id, name, decoded)

            await asyncio.gather(
                read_stream(process.stdout, "stdout"),
                read_stream(process.stderr, "stderr")
            )

            await process.wait()
            task.exit_code = process.returncode
            task.completed_at = datetime.utcnow()

            if process.returncode == 0:
                task.status = TaskStatus.COMPLETED
                await self.broadcast_log(task_id, "stdout", f"\r\n\x1b[32m✔ Concluído com sucesso (código 0)\x1b[0m")
            else:
                task.status = TaskStatus.FAILED
                await self.broadcast_log(task_id, "stderr", f"\r\n\x1b[31m✘ Falha na execução (código {process.returncode})\x1b[0m")

        except Exception as e:
            task.status = TaskStatus.FAILED
            task.completed_at = datetime.utcnow()
            task.exit_code = -1
            await self.broadcast_log(task_id, "stderr", f"\r\n\x1b[31m✘ Exceção: {str(e)}\x1b[0m")
        finally:
            if task_id in self.running_processes:
                del self.running_processes[task_id]
            await self._finalize_task(task_id)

    async def _finalize_task(self, task_id: str):
        task = self.tasks[task_id]
        # Fechar o arquivo de log dedicado e gravar sumário final
        handle = self.log_handles.get(task_id)
        if handle and not handle.closed:
            try:
                duration = 0.0
                if task.started_at and task.completed_at:
                    duration = (task.completed_at - task.started_at).total_seconds()
                handle.write(
                    f"\n================================================================================\n"
                    f"Finalização da Tarefa: {task.status.value.upper()}\n"
                    f"Código de Saída: {task.exit_code}\n"
                    f"Concluído em UTC: {task.completed_at.isoformat() if task.completed_at else 'N/A'}\n"
                    f"Duração Total: {duration:.2f}s\n"
                    f"================================================================================\n"
                )
                handle.flush()
                handle.close()
            except Exception as e:
                logger.error(f"Erro ao finalizar log da tarefa {task_id}: {e}")

        await self.broadcast_status(task)

    async def _simulate_command(self, task_id: str, command_args: List[str]):
        """
        Simulação realista para desenvolvimento local em macOS ou ambientes sem permissão root.
        """
        task = self.tasks[task_id]
        cmd_str = " ".join(command_args)
        await self.broadcast_log(task_id, "stdout", "\x1b[33m[MODO DE SIMULAÇÃO ATIVO - Execução segura em ambiente dev]\x1b[0m\r\n")
        
        simulated_steps = []
        if any("samba" in arg for arg in command_args) or any("provision" in arg for arg in command_args):
            simulated_steps = [
                "Verificando integridade prévia (/var/lib/samba/private/sam.ldb)...",
                "Parando serviços conflitantes (systemd-resolved, smbd, nmbd)...",
                "Validando configuração de rede e resolução DNS...",
                "Configurando base de dados LDB e schema Active Directory...",
                "Criando partições CN=Configuration, CN=Schema, DC=Domain...",
                "Configurando subsistema Kerberos KDC...",
                "Gerando chaves de criptografia e certificados TLS x509...",
                "Criando zona DNS do domínio com registros SRV e Kerberos...",
                "Configurando Sysvol e Netlogon em /var/lib/samba/sysvol...",
                "Definindo permissões ACL em Sysvol (samba-tool ntacl sysvolreset)...",
                "Habilitando e iniciando serviço samba-ad-dc.service...",
                "Validando registros DNS via host -t SRV _ldap._tcp..."
            ]
        elif any("apt" in arg for arg in command_args) or any("install" in arg for arg in command_args):
            simulated_steps = [
                "Reading package lists... Done",
                "Building dependency tree... Done",
                "Reading state information... Done",
                "The following additional packages will be installed...",
                "Unpacking dependencies...",
                "Setting up packages...",
                "Processing triggers for man-db, systemd...",
                "Installation completed successfully."
            ]
        elif any("netplan" in arg for arg in command_args):
            simulated_steps = [
                "Validating netplan YAML syntax...",
                "Generating configuration files for systemd-networkd...",
                "Applying new network configuration...",
                "Interface configuration reloaded without errors."
            ]
        elif any("ufw" in arg for arg in command_args):
            simulated_steps = [
                "Reading current UFW rules from /etc/ufw/user.rules...",
                "Applying firewall updates via iptables/nftables backend...",
                "Firewall status updated successfully."
            ]
        elif any("kea" in arg for arg in command_args) or any("dhcp" in arg for arg in command_args):
            simulated_steps = [
                "Checking DHCP configuration syntax...",
                "Testing lease database connectivity...",
                "Reloading Kea DHCP4 service daemon...",
                "Service active and listening on specified interfaces."
            ]
        else:
            simulated_steps = [
                "Iniciando rotina de automação...",
                "Verificando pré-condições do sistema...",
                "Aplicando alterações nos arquivos de sistema...",
                "Reiniciando daemons afetados...",
                "Operação finalizada."
            ]

        for step in simulated_steps:
            await asyncio.sleep(0.3)
            await self.broadcast_log(task_id, "stdout", f"  \x1b[34m→\x1b[0m {step}")

        await asyncio.sleep(0.2)
        task.status = TaskStatus.COMPLETED
        task.exit_code = 0
        task.completed_at = datetime.utcnow()
        await self.broadcast_log(task_id, "stdout", "\r\n\x1b[32m✔ [SIMULAÇÃO] Tarefa concluída com sucesso.\x1b[0m")
        await self._finalize_task(task_id)

executor = CommandExecutor()
