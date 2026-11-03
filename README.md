# ASTER ServerCore — Gestão e Automação de Servidores Linux

Aplicação Web corporativa para provisionamento, monitorização e automação de serviços essenciais de infraestrutura no **Ubuntu Server**:
- **Tela de Autenticação Corporativa (Login)**: Design de alta tecnologia com **Glassmorphism profundo**, iluminação ambiente difusa, telemetria em tempo real do host, detecção inteligente de Caps Lock e modo híbrido (Ubuntu PAM vs Admin Local).
- **Módulo de Monitorização em Tempo Real (Dashboard)**: Telemetria contínua via **WebSockets** a cada 2s com gráficos SVG de CPU/Rede e diagnóstico via **journalctl**.
- **Garantia de Arranque no Boot (Reboot Resilience)**: Persistência e auto-inicialização garantida via `systemctl enable` para todos os serviços essenciais.
- **Samba 4 Active Directory Domain Controller (AD DC)**
- **Servidor DHCP** (ISC Kea DHCPv4 e Dnsmasq)
- **Servidor DNS** (BIND9 e Samba Internal DNS na porta 53/UDP)
- **Firewall UFW** (com preset inteligente para AD DC e NAT/Masquerade)
- **Rede & Netplan** (`/etc/netplan/01-netcfg.yaml`)
- **Setup Wizard de Orquestração Unificada** (Rede -> AD -> DHCP -> UFW)
- **Autenticação Híbrida Segura** (PAM Ubuntu / sudoers + Admin Local via JWT)
- **Terminal xterm.js** integrado com streaming em tempo real via **WebSockets**
- **Pronto para Produção**: Pacote estático otimizado gerado em `frontend/dist/`, servido com fallback de SPA no FastAPI e serviço nativo `systemd`.

---

## 🛠️ Stack Tecnológica

- **Backend**: Python 3.9+ com **FastAPI**, **WebSockets**, **Pydantic v2**, **Jinja2** e **asyncio.subprocess**.
- **Frontend**: **React 18** + **TypeScript** + **Vite** + **Tailwind CSS**, ícones **Lucide React** e emulador de terminal **xterm.js** (`@xterm/xterm` + `@xterm/addon-fit`).
- **Automação de Sistema**: Execução assíncrona não-bloqueante de comandos de longa duração (`apt-get install`, `samba-tool domain provision`, `netplan apply`, `ufw`) com streaming de `stdout`/`stderr` em tempo real.
- **Modo Dual**: Detecção inteligente de ambiente — opera em **Modo Produção** no Ubuntu Server como root e em **Modo Simulação** em ambientes de desenvolvimento (macOS, Windows ou Linux não-root).

---

## 📁 Estrutura do Projeto

```text
SGLinux/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── monitor.py         # Telemetria WebSocket (/ws/monitor), controle e logs de serviços
│   │   │   ├── system.py          # Métricas de CPU, RAM, disco e serviços
│   │   │   ├── network.py         # Interfaces e aplicação de Netplan
│   │   │   ├── samba.py           # Provisionamento AD DC e gestão de serviço
│   │   │   ├── dhcp.py            # Kea/Dnsmasq pools, leases e reservas
│   │   │   ├── firewall.py        # Regras UFW, NAT e preset de portas AD DC
│   │   │   ├── wizard.py          # WebSocket e validação do Setup Wizard unificado
│   │   │   └── tasks.py           # Histórico de tarefas e WebSockets
│   │   ├── core/
│   │   │   ├── config.py          # Configurações e caminhos /etc
│   │   │   ├── executor.py        # CommandExecutor com asyncio.subprocess e broadcast
│   │   │   ├── firewall_profiles.py # Mapeamento de perfis de serviços (SSH, Samba AD, DNS, DHCP)
│   │   │   └── templates.py       # Renderização Jinja2 e backups automáticos
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── monitor.py         # MonitorService (telemetria psutil, systemctl e journalctl)
│   │   │   ├── dhcp.py            # KeaDhcpService (apt install, kea-dhcp4 -t, systemctl)
│   │   │   ├── firewall.py        # FirewallService (UFW status/regras, perfis, NAT/Masquerade, sysctl)
│   │   │   └── wizard_orchestrator.py # Orquestrador sequencial 4 Etapas (Rede -> AD -> DHCP -> UFW)
│   │   ├── schemas.py             # SystemMonitorPayload, WizardSetupRequest, DhcpConfigRequest
│   │   ├── models/
│   │   │   ├── network.py         # Validação de CIDR, IPs e Netplan
│   │   │   ├── samba.py           # Validação de Realm, NetBIOS e complexidade de senha
│   │   │   ├── dhcp.py            # Validação de sub-redes, pools e MAC
│   │   │   ├── firewall.py        # Validação de portas, perfis, regras UFW e NAT
│   │   │   └── task.py            # Modelos de estado de tarefas assíncronas
│   │   ├── templates/
│   │   │   ├── netplan.yaml.j2    # Template Ubuntu Netplan
│   │   │   ├── smb.conf.j2        # Template Samba 4 Active Directory
│   │   │   ├── kea-dhcp4.conf.j2  # Template ISC Kea DHCPv4
│   │   │   ├── dnsmasq.conf.j2    # Template Dnsmasq
│   │   │   └── named.conf.options.j2 # Template BIND9 Options
│   │   └── main.py                # FastAPI entrypoint e montagem do frontend
│   ├── tests/
│   │   ├── test_monitor.py        # Testes de snapshot, controlo de serviços e WebSocket
│   │   ├── test_validation.py     # Testes unitários Pydantic, Wizard e Jinja2
│   │   └── test_api.py            # Testes de integração FastAPI, Executor e Wizard WS
│   ├── pytest.ini
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.tsx         # Cabeçalho com métricas e atalho de terminal
│   │   │   ├── AsterLogo.tsx      # Identidade visual oficial ASTER ServerCore
│   │   │   ├── DashboardView.vue  # Componente Vue 3 SFC para Telemetria em Tempo Real
│   │   │   ├── TerminalModal.tsx  # Terminal xterm.js conectado via WebSocket
│   │   │   ├── SetupWizard.tsx    # Assistente 4 passos com terminal xterm.js em tempo real
│   │   │   ├── SetupWizard.vue    # Componente Vue 3 SFC equivalente para Setup Wizard
│   │   │   ├── NetworkSetup.tsx   # Assistente rápido de IP/Netplan com WebSocket
│   │   │   ├── NetworkSetup.vue   # Componente Vue 3 SFC equivalente
│   │   │   ├── DhcpConfig.vue     # Componente Vue 3 SFC para Kea DHCP e leases
│   │   │   ├── FirewallManager.tsx # Gestor completo de Firewall UFW, Perfis 1-Clique e NAT
│   │   │   └── FirewallManager.vue # Componente Vue 3 SFC equivalente para Firewall e NAT
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx      # Dashboard com KPI Cards, painel de serviços e gráficos SVG
│   │   │   ├── SetupWizard.tsx    # Página integradora do Assistente Unificado
│   │   │   ├── NetworkConfig.tsx  # Editor visual de Netplan e prévia YAML
│   │   │   ├── SambaProvision.tsx # Assistente de provisionamento AD DC
│   │   │   ├── DhcpConfig.tsx     # Gestão Kea DHCP, pools e leases CSV em tempo real
│   │   │   └── FirewallRules.tsx  # Página integradora de Firewall UFW e NAT
│   │   ├── services/
│   │   │   └── api.ts             # Cliente HTTP e tipagens com TypeScript
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
├── scripts/
│   └── setup_boot_services.sh     # Script para persistência e arranque no boot de todos os serviços
├── systemd/
│   ├── aster-servercore.service   # Unit systemd oficial para execução em produção com auto-restart
│   └── sglinux.service            # Unit de compatibilidade retroativa
├── Dockerfile                     # Build multi-stage
├── docker-compose.yml
├── run.sh                         # Script de inicialização unificada
└── README.md
```

---

## ⚡ 1. Mecanismo de Execução Segura e Streaming em Tempo Real

O coração da automação reside no módulo `app/core/executor.py`:
1. **Listas de Argumentos Seguras com `asyncio.create_subprocess_exec`**:
   - Os comandos nunca utilizam interpolação direta em strings com `shell=True`.
   - Todos os argumentos são passados estritamente como listas (`List[str]`), por exemplo `["samba-tool", "domain", "provision", "--realm=...", ...]`, neutralizando vulnerabilidades de *command injection* e falhas de escape com senhas complexas contendo caracteres como `$`, `!`, `&`, `'` ou `"`.
   - Em produção, caso o processo não seja root, o prefixo `sudo` é anexado como elemento da lista de forma segura.
2. **Histórico e Logs Dedicados de Auditoria (`/var/log/sysmanager/install_<job_id>.log`)**:
   - Cada execução gera um identificador único de tarefa (`task_id` / `job_id`).
   - Todos os outputs (`stdout` e `stderr`) são salvos em arquivos de log dedicados em `/var/log/sysmanager/install_<job_id>.log` (com fallback seguro para `data/logs/` em desenvolvimento).
   - O log em disco possui cabeçalho de auditoria com timestamp ISO, comando executado, utilizador e códigos ANSI removidos para leitura limpa com `cat`, `less` ou `grep`.
   - Pode ser consultado diretamente na API via `GET /api/tasks/{task_id}/log`.
3. **Streaming em Tempo Real com WebSockets**:
   - Dois leitores assíncronos processam as linhas emitidas instantaneamente.
   - Cada linha lida é enviada por **WebSocket** (`/api/tasks/ws/{task_id}` ou `/api/tasks/ws/stream/terminal`) para todas as instâncias conectadas.
   - No frontend, o componente `TerminalModal.tsx` renderiza os caracteres no **xterm.js** com autoscroll e ajuste de resolução com `FitAddon`.
   - O utilizador pode acompanhar o progresso passo a passo ou interromper o processo através do botão "Interromper".

---

## 🛡️ 2. Verificação de Estado Prévio (Pre-flight Checks) & Proteção Contra Corrupção

Antes de qualquer operação destrutiva ou de provisionamento:
- **Detecção de Domínio Existente**: A API verifica a existência física da base do Samba AD em `/var/lib/samba/private/sam.ldb`. Se o arquivo existir, a rota `POST /api/samba/provision` recusa o provisionamento com **HTTP 409 Conflict**, alertando o administrador e prevenindo corrupção irreversível do catálogo do AD.
- **Sobrescrita Forçada Explícita**: Para re-provisionar um controlador, o utilizador deve marcar expressamente o parâmetro `force=true` (disponível no assistente visual), que arquiva a base anterior com segurança antes de proceder.
- **Endpoint de Pré-voo**: `GET /api/samba/preflight` informa à interface se o Samba, DNS ou Netplan já possuem configurações ativas.
- **Backups Automáticos em `/etc`**: Antes de sobrescrever qualquer arquivo (`smb.conf`, `01-netcfg.yaml`, etc.), o sistema gera uma cópia de segurança com timestamp no formato `.bak-YYYYMMDDHHMMSS`.

---

## 🔒 2. Validação Rigorosa de Dados com Pydantic v2

- **Samba 4 AD DC**:
  - `realm`: Validação estrita de FQDN (ex: `EMPRESA.LOCAL`), exigindo formato DNS válido com pelo menos um ponto.
  - `domain`: Validação de nome NetBIOS (máximo de 15 caracteres alfanuméricos, sem pontos nem caracteres inválidos).
  - `admin_password`: Política de complexidade do Active Directory validada programaticamente (mínimo de 8 caracteres, exigindo maiúsculas, minúsculas, números e caracteres especiais).
- **Rede & Netplan**:
  - Endereços IPv4 validados em notação CIDR estrita via biblioteca `ipaddress` (ex: `192.168.1.10/24`).
  - Validação de gateways e listas de servidores DNS recursivos.
- **Servidor DHCP**:
  - Validação cruzada: o início (`pool_start`) e o fim (`pool_end`) do pool dinâmico devem pertencer obrigatoriamente à sub-rede declarada e o IP inicial não pode ser superior ao final.
  - Validação estrita de endereços MAC (`aa:bb:cc:dd:ee:ff`) para reservas estáticas.
- **Firewall UFW**:
  - Validação de portas unitárias (1-65535) e intervalos (ex: `49152:65535`), além de serviços conhecidos.

---

## 🚀 3. Como Executar

### Opção A: Execução Local Rápida (com Modo Simulação automático)

```bash
# 1. Clonar o repositório e entrar na pasta
cd SGLinux

# 2. Executar o script unificado
./run.sh
```

Acesse a interface no navegador:
- **Painel Web**: [http://localhost:8000](http://localhost:8000)
- **Documentação Interativa Swagger**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### Opção B: Implantação no Ubuntu Server (Produção)

> 📖 **Guia Completo de Produção:** Consulte o documento passo a passo em [docs/DEPLOY_PRODUCAO.md](file:///Users/emunene/Downloads/Antigravity/SGLinux/docs/DEPLOY_PRODUCAO.md) para detalhes de provisionamento, resolução do DNS stub na porta 53, testes pós-instalação e configuração de proxy reverso.

1. **Instalar dependências de sistema**:
```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nodejs npm git
```

2. **Clonar e configurar o projeto em `/opt/sglinux`**:
```bash
sudo git clone <URL_DO_REPOSITORIO> /opt/sglinux
cd /opt/sglinux

# Criar ambiente virtual
sudo python3 -m venv .venv
sudo .venv/bin/pip install --upgrade pip
sudo .venv/bin/pip install -r backend/requirements.txt

# Construir o frontend React
cd frontend
sudo npm install
sudo npm run build
cd ..
```

3. **Habilitar o serviço Systemd**:
```bash
sudo cp systemd/aster-servercore.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now aster-servercore
```

4. **Verificar o estado do serviço**:
```bash
sudo systemctl status aster-servercore
```

---

## 🧪 4. Execução dos Testes Automatizados

O projeto inclui suíte completa de testes unitários e de integração (`pytest`):

```bash
# Ativar venv e executar pytest
cd backend
../.venv/bin/pytest -v
```

**Resultados da validação**:
- `test_health_check` — Verificação de integridade da API
- `test_system_info` — Coleta de métricas reais de hardware
- `test_network_interfaces` — Listagem de placas de rede
- `test_samba_status` — Verificação de estado do Samba AD
- `test_firewall_status` — Consulta e parsing do UFW
- `test_background_task_execution` — Execução assíncrona com streaming
- `test_subprocess_exec_list_args_and_dedicated_log` — Validação de execução segura com listas de argumentos e geração do arquivo `/var/log/sysmanager/install_<job_id>.log`
- `test_samba_preflight_and_state_verification` — Verificação prévia de `/var/lib/samba/private/sam.ldb`, rejeição 409 Conflict e sobrescrita segura com `force=True`
- `test_valid_netplan_config` / `test_invalid_netplan_cidr` — Validação Netplan
- `test_valid_samba_provision_request` / `test_samba_password_complexity` — Validações Samba AD DC
- `test_valid_dhcp_subnet_and_pools` / `test_invalid_mac_address` — Validações DHCP
- `test_valid_firewall_rule` / `test_invalid_firewall_port` — Validações UFW
- `test_valid_wizard_setup_request` — Validação integral do payload do Setup Wizard
- `test_wizard_invalid_cidr` / `test_wizard_invalid_password` — Rejeição de CIDR inválido e senhas sem requisitos de complexidade
- `test_wizard_dhcp_pool_out_of_subnet` / `test_wizard_dhcp_start_greater_than_end` — Validações de pools DHCP subordinados à sub-rede
- `test_monitor_snapshot` — Captura de métricas completas de hardware (CPU, RAM, discos `/` e `/var`, rede, uptime)
- `test_monitor_control_service_authorized` — Execução e autorização de `start`, `stop`, `restart` de serviços
- `test_monitor_control_service_unauthorized` — Rejeição 401 de tentativas sem token JWT
- `test_monitor_logs_endpoint` — Extração de logs diagnósticos das últimas 100 linhas via `journalctl`
- `test_monitor_websocket_telemetry` — Streaming assíncrono contínuo de telemetria a cada 2s via `/ws/monitor`
- Total: **56 testes unitários e de integração aprovados com 100% de sucesso**.

---

## 📊 6. Módulo de Monitorização em Tempo Real (System & Services Monitor)

A página inicial (**Dashboard**) do ASTER ServerCore atua como central de operações e telemetria viva do servidor:

1. **Recolha de Métricas Não-Bloqueante com `psutil`**:
   - **Processador (CPU)**: Percentagem de uso instantânea, núcleos físicos/lógicos e Load Average (1, 5 e 15 minutos).
   - **Memória RAM & Swap**: Utilização de RAM (usada, disponível, total) e partição de troca (Swap).
   - **Armazenamento em Disco**: Partição raiz `/` e partição `/var` (onde residem as bases do Samba AD e os logs do journalctl).
   - **Tráfego de Rede Diferencial**: Cálculo por segundo de taxa de download (RX) e upload (TX) em tempo real.
   - **Uptime & Identidade**: Hostname, FQDN e tempo de atividade formatado.
2. **Streaming Contínuo via WebSockets (`/ws/monitor`)**:
   - Envia um snapshot estruturado a cada **2 segundos** enquanto o utilizador estiver no Dashboard.
   - Fallback automático para polling HTTP (`/api/monitor/snapshot`) em caso de oscilação da conexão.
3. **Painel de Serviços Críticos**:
   - Monitoriza `samba-ad-dc`, `kea-dhcp4-server`, `ufw`, `ssh` e porta 53/UDP aberta (DNS).
   - Badges visuais **ONLINE** (verde esmeralda pulsante) ou **OFFLINE** (vermelho).
   - **Ações Imediatas**: Botões para **Reiniciar** (`restart`), **Parar/Iniciar** (`stop`/`start`) com feedback imediato.
   - **Diagnóstico Rápido**: Modal integrado que exibe a saída em tempo real do `journalctl -u <serviço> --no-pager` (últimas 100 linhas) com botão de cópia.
4. **Gráficos em Tempo Real**:
   - Gráfico de histórico de carga da CPU (%) nos últimos 60 segundos com área em gradiente Ciano `#0EA5E9`.
   - Gráfico de tráfego de rede (RX em ciano e TX em laranja `#F97316`).

---

## 🔄 7. Garantia de Arranque Automático no Boot (Reboot Resilience)

Para garantir que caso o servidor físico seja reiniciado (`sudo reboot`), **todos os serviços voltem a arrancar automaticamente de forma 100% autônoma**, o sistema implementa:

1. **Auto-Habilitação nos Módulos de Gestão**:
   - Ao provisionar via **Setup Wizard** ou ao iniciar serviços no **Dashboard**, os comandos `systemctl enable <servico>` e `systemctl unmask samba-ad-dc` são executados pelo backend.
2. **Script de Inicialização Unificada (`scripts/setup_boot_services.sh`)**:
   - Um script idempotente para auditar e habilitar em 1 clique todos os serviços essenciais:
     ```bash
     cd /opt/sglinux
     sudo ./scripts/setup_boot_services.sh
     ```
3. **Units de Serviço do Systemd**:
   - [systemd/aster-servercore.service](file:///opt/sglinux/systemd/aster-servercore.service) com `Restart=always`, `RestartSec=5` e dependência de `network-online.target`.
   - Persistência das regras de firewall com `systemctl enable ufw`.

---

## 🧙‍♂️ 5. Módulo de Orquestração Unificada (Setup Wizard)

O módulo **Setup Wizard** orquestra o provisionamento integral de um novo servidor Ubuntu Server através de uma interface interativa com **Stepper de 4 Passos** e terminal de telemetria `xterm.js` via **WebSockets**:

```
[ 1. Rede & Netplan ] ──► [ 2. Samba 4 AD DC ] ──► [ 3. ISC Kea DHCPv4 ] ──► [ 4. Firewall UFW ]
  - IP Estático CIDR        - Pacotes Samba 4        - Sub-rede e Pools       - Salvaguarda SSH (22)
  - Gateway / DNS Upstream  - Provisionamento Realm  - Servidor DNS Primário   - 17 portas Samba AD DC
  - Desativação Stub DNS    - Kerberos (/etc/krb5)     automático (IP Etapa 1) - DHCP e DNS Liberados
```

### Características Principais:
1. **Tratamento Estrito de Erro (Fail-Fast)**:
   - Se qualquer comando falhar (código de saída ≠ 0), o fluxo é interrompido imediatamente para evitar estados inconsistentes no sistema operacional.
2. **Resolução de Conflito na Porta 53 (DNS Stub Listener)**:
   - O Ubuntu Server vem com o `systemd-resolved` a escutar em `127.0.0.53:53`. O assistente desativa automaticamente o `DNSStubListener=no` através de drop-in em `/etc/systemd/resolved.conf.d/sglinux-disable-stub.conf`, permitindo que o Samba 4 Internal DNS vincule a porta 53 sem conflitos.
3. **Distribuição Automática de DNS no DHCP**:
   - O endereço IP configurado na Etapa 1 é injetado como DNS primário na configuração do ISC Kea DHCP, garantindo que estações de trabalho recebam a configuração necessária para ingresso no domínio Active Directory.
4. **Salvaguarda Obrigatória de SSH**:
   - Mesmo que a firewall UFW seja ativada, a porta 22/tcp é obrigatoriamente liberada antes da ativação do firewall (`ufw allow 22/tcp`), impedindo bloqueio acidental do administrador remoto.
5. **Logs de Auditoria Dedicados**:
   - Cada sessão gera um ficheiro de auditoria em `/var/log/sysmanager/wizard_<job_id>.log` contendo todos os comandos executados, timestamps e saídas de terminal.
