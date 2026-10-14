# Guia de Implementação em Máquina Real / Produção (Ubuntu Server)

Este documento fornece o passo a passo completo para implementar o **SGLinux** e executar o **Setup Wizard de Orquestração Unificada** diretamente num servidor físico ou máquina virtual em ambiente de produção com **Ubuntu Server 22.04 LTS** ou **Ubuntu Server 24.04 LTS**.

---

## 🏗️ 1. Como Funciona o Modo de Produção no SGLinux

O SGLinux possui um mecanismo inteligente de deteção de ambiente ([backend/app/core/config.py](file:///opt/sglinux/backend/app/core/config.py)):
* Quando executado no **Linux** com privilégios de **`root`** (`os.geteuid() == 0`), a variável `SIMULATION_MODE` é automaticamente desativada (`False`).
* Os comandos (`netplan apply`, `samba-tool domain provision`, `systemctl`, `ufw`, etc.) são executados diretamente no sistema operacional via `asyncio.subprocess` com listas de argumentos seguras.
* As alterações afetam os ficheiros reais do sistema em `/etc/netplan/01-netcfg.yaml`, `/etc/samba/smb.conf`, `/etc/krb5.conf`, `/etc/kea/kea-dhcp4.conf`, `/etc/systemd/resolved.conf.d/` e as regras de firewall do kernel Linux (`iptables/ufw`).
* Todo o histórico é gravado em logs dedicados de auditoria em `/var/log/sysmanager/wizard_<id>.log`.

---

## 📋 2. Pré-Requisitos do Servidor

| Requisito | Mínimo Recomendado |
| :--- | :--- |
| **Sistema Operativo** | Ubuntu Server 22.04 LTS ou 24.04 LTS (instalação Minimal/Base) |
| **Privilégios** | Acesso `root` ou utilizador com permissão `sudo` |
| **Processador** | 2 vCPUs (x86_64) |
| **Memória RAM** | 2 GB (4 GB recomendados para AD DC + DHCP com múltiplas estações) |
| **Armazenamento** | 20 GB de espaço livre |
| **Rede** | 1 interface de rede física ou virtual conectada (ex: `eth0`, `ens18`, `enp3s0`) |
| **Internet** | Conectividade temporária à Internet para descarregar pacotes via `apt` |

---

## 🚀 3. Passo a Passo de Instalação e Deploy no Servidor

O diretório padrão de instalação para o serviço é `/opt/sglinux`, conforme definido na unit de serviço do systemd ([systemd/sglinux.service](file:///opt/sglinux/systemd/sglinux.service)).

### Passo 3.1: Atualizar o Sistema e Instalar Pacotes Base
Aceda ao servidor via SSH ou consola local e instale as dependências essenciais:

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y python3 python3-venv python3-pip curl git net-tools
```

---

### Passo 3.2: Copiar os Ficheiros do Projeto para `/opt/sglinux`
Crie o diretório de destino e transfira os ficheiros da aplicação:

```bash
sudo mkdir -p /opt/sglinux
```

*Se estiver a transferir a partir da sua máquina de desenvolvimento via `rsync`:*
```bash
# Executado a partir da sua máquina local:
rsync -avz --exclude '.venv' --exclude 'node_modules' --exclude '.git' \
  ./ root@<IP_DO_SERVIDOR>:/opt/sglinux/
```

*Ou via Git no próprio servidor:*
```bash
sudo git clone https://seu-repositorio.git /opt/sglinux
```

Garanta que as permissões de execução do script estão corretas:
```bash
cd /opt/sglinux
sudo chmod +x run.sh
```

---

### Passo 3.3: Configurar o Ambiente Virtual Python
Crie o virtualenv isolado do projeto e instale as dependências FastAPI e Pydantic:

```bash
cd /opt/sglinux
sudo python3 -m venv .venv
sudo .venv/bin/pip install --upgrade pip
sudo .venv/bin/pip install -r backend/requirements.txt
```

---

### Passo 3.4: Construir o Frontend (React / Vite)

#### Opção A (Recomendada): Compilar no próprio servidor
Instale o Node.js 20 LTS e construa o pacote estático:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

cd /opt/sglinux/frontend
sudo npm install
sudo npm run build
```

#### Opção B: Compilar localmente e transferir a pasta `dist`
Se preferir não instalar o Node.js no servidor de produção, compile no seu computador e copie a pasta `dist`:
```bash
# Na sua máquina de trabalho:
cd frontend && npm run build
rsync -avz dist/ root@<IP_DO_SERVIDOR>:/opt/sglinux/frontend/dist/
```

> **Importante:** O backend FastAPI ([backend/app/main.py](file:///opt/sglinux/backend/app/main.py)) monta automaticamente o diretório `/opt/sglinux/frontend/dist` para servir a interface web na rota raiz `/`.

---

### Passo 3.5: Instalar e Ativar o Serviço Systemd (Arranque no Boot)
Configure a inicialização automática do **ASTER ServerCore** como serviço nativo de sistema gerenciado pelo `systemd`:

1. Copie o ficheiro de serviço oficial do ASTER ServerCore (e o alias de compatibilidade):
   ```bash
   sudo cp /opt/sglinux/systemd/aster-servercore.service /etc/systemd/system/
   sudo cp /opt/sglinux/systemd/sglinux.service /etc/systemd/system/
   ```

2. Recarregue os daemons do systemd:
   ```bash
   sudo systemctl daemon-reload
   ```

3. Ative o serviço para arrancar automaticamente com o sistema no boot:
   ```bash
   sudo systemctl enable --now aster-servercore
   ```

4. Verifique se o serviço está ativo e funcional:
   ```bash
   sudo systemctl status aster-servercore
   ```

A saída deve indicar `Active: active (running)` e escutando na porta `8000`.

> 💡 **Automação 1-Clique de Inicialização:** Também pode executar o script utilitário incluído no projeto para configurar a persistência de todos os serviços de uma só vez:
> ```bash
> cd /opt/sglinux
> sudo ./scripts/setup_boot_services.sh
> ```

## 🔐 4. Acesso ao Painel e Autenticação Corporativa Híbrida

Com o serviço ativo, aceda a partir de qualquer computador na mesma rede:

```text
http://<IP_DO_SERVIDOR>:8000
```

Será recebido pela **Tela de Autenticação Oficial ASTER ServerCore**, desenhada para ambientes corporativos com efeitos de iluminação ambiente, telemetria em tempo real e arquitetura de autenticação dupla:

1. **Indicador de Telemetria do Servidor (Heartbeat)**:
   - Exibe no topo do cartão de acesso o estado da conexão, hostname real, endereço IP ativo e modo de operação (Produção / Simulação).
2. **Aba "Ubuntu (PAM / sudo)"**:
   - Utilize as suas credenciais reais de utilizador do servidor Ubuntu (as mesmas usadas para entrar por SSH ou na consola local).
   - Suporta contas `root` ou utilizadores membros dos grupos administrativos `sudo`/`admin`/`wheel`.
3. **Aba "Admin ServerCore (Local)"**:
   - Conta administrativa interna independente do sistema operativo, ideal para primeiro acesso ou ambientes sem utilizador PAM configurado.
   - **Utilizador Padrão**: `admin`
   - **Palavra-passe Padrão**: `SGLinux@Admin2026!` *(configurável via variável de ambiente `SGLINUX_ADMIN_PASSWORD`)*.
4. **Recursos de Usabilidade e Segurança**:
   - **Detecção de Caps Lock**: Alerta imediato e pulsante caso a tecla de maiúsculas esteja ativada, prevenindo erros ao digitar a senha.
   - **Alternar Visualização de Palavra-passe**: Botão tátil para inspecionar a senha digitada.
   - **Atalhos Rápidos de Demonstração / Primeiro Acesso**: Botões dedicados no rodapé do formulário para preenchimento em 1 clique durante testes ou provisionamento inicial.
   - **Sessão JWT Segura**: O login gera um token JWT assinado (`HS256`) com renovação automática e suporte a "Manter sessão iniciada por 30 dias".

---

## 🧙‍♂️ 5. Execução do Setup Wizard na Interface Web

Após o login:

1. **Aceder ao Wizard**: No menu lateral esquerdo, clique em **Setup Wizard**.
2. **Passo 1 (Rede & Netplan)**:
   - Selecione a interface física de rede (ex: `eth0` ou `ens18`).
   - Insira o IP estático com máscara CIDR (ex: `192.168.1.10/24`).
   - Defina o Gateway da sua rede (ex: `192.168.1.1`).
   - Defina os Forwarders DNS upstream (ex: `8.8.8.8, 1.1.1.1`).
3. **Passo 2 (Domínio Samba AD DC)**:
   - Realm Kerberos FQDN em maiúsculas (ex: `EMPRESA.LOCAL`).
   - Nome NetBIOS do Domínio (ex: `EMPRESA`, máx. 15 caracteres).
   - Senha forte do Administrador (mínimo 8 caracteres, maiúsculas, minúsculas, números e símbolos).
4. **Passo 3 (DHCP Kea & Firewall)**:
   - Deixe ativada a opção **Kea DHCPv4**. Os pools de início e fim serão sugeridos automaticamente com base no IP configurado no Passo 1 (ex: `192.168.1.100` a `192.168.1.200`).
   - Confirme a opção **Ativar Firewall UFW**.
5. **Passo 4 (Resumo & Execução)**:
   - Reveja todos os parâmetros no resumo.
   - Clique em **"Iniciar Provisionamento Completo"**.
   - O terminal `xterm.js` conectará ao WebSocket `/ws/wizard/execute` e exibirá o progresso contínuo em 4 etapas:
     - **0% -> 25%**: Aplicação do Netplan e desativação do stub listener da porta 53 no `systemd-resolved`.
     - **25% -> 50%**: Instalação do Samba 4, provisionamento do domínio AD DC, cópia do Kerberos `/etc/krb5.conf` e arranque de `samba-ad-dc`.
     - **50% -> 75%**: Instalação e configuração do ISC Kea DHCPv4 distribuindo automaticamente o IP do servidor como DNS primário às estações.
     - **75% -> 100%**: Salvaguarda da porta 22 (SSH), liberação das portas essenciais do AD DC + DHCP e ativação do firewall UFW.

---

## 🔍 5. Validação e Testes Pós-Instalação no Servidor Real

Após a conclusão com sucesso do assistente, execute as verificações a partir do terminal do servidor:

### 5.1. Testar o Samba 4 AD DC
```bash
# Informações do domínio
sudo samba-tool domain info 127.0.0.1

# Listar partilhas de rede públicas e administrativas (netlogon e sysvol)
smbclient -L localhost -U%
```

### 5.2. Testar a Resolução DNS na Porta 53
```bash
# Testar resolução do próprio domínio
host -t A empresa.local 127.0.0.1

# Testar registo SRV do LDAP (essencial para clientes Windows entrarem no domínio)
host -t SRV _ldap._tcp.empresa.local 127.0.0.1
```

### 5.3. Testar a Autenticação Kerberos
```bash
# Obter ticket Kerberos de administrador (insira a senha definida no Wizard)
kinit administrator

# Visualizar o ticket obtido
klist
```

### 5.4. Verificar o Servidor Kea DHCP
```bash
# Estado do serviço
sudo systemctl status kea-dhcp4-server

# Teste de sintaxe do ficheiro de configuração
sudo kea-dhcp4 -t /etc/kea/kea-dhcp4.conf
```

### 5.5. Verificar as Regras do Firewall UFW
```bash
sudo ufw status verbose
```
*Deve listar: Porta 22/tcp (SSH), Porta 53 (DNS), Porta 88 (Kerberos), Porta 389/636 (LDAP), Porta 445 (SMB), Porta 67 (DHCP) e portas RPC dinâmicas (49152:65535/tcp).*

### 5.6. Consultar o Ficheiro de Auditoria do Wizard
```bash
cat /var/log/sysmanager/wizard_*.log
```

---

## 🔄 6. Garantia de Arranque Automático no Boot (Reboot Resilience)

Para garantir que caso o servidor físico ou a máquina virtual seja reiniciada (`sudo reboot`), **todos os serviços subam automaticamente de forma 100% autônoma**, o ASTER ServerCore implementa a seguinte arquitetura de persistência:

### 6.1. Matriz de Serviços do Sistema

| Serviço | Nome no Systemd | Comportamento no Boot | Como é Habilitado |
| :--- | :--- | :--- | :--- |
| **ASTER ServerCore** | `aster-servercore.service` | Inicia automaticamente (`multi-user.target`) com auto-restart | `systemctl enable aster-servercore` |
| **Samba 4 AD DC** | `samba-ad-dc.service` | Inicia automaticamente; serviços legados (`smbd`, `nmbd`, `winbind`) permanecem mascarados | Executado no Setup Wizard ou `systemctl enable samba-ad-dc` |
| **Kea DHCPv4** | `kea-dhcp4-server.service` | Inicia automaticamente após a interface de rede estar UP | Executado no Setup Wizard / DHCP apply ou `systemctl enable kea-dhcp4-server` |
| **Firewall UFW** | `ufw.service` | Regras restauradas pelo kernel Linux no boot (`netfilter`) | `ufw --force enable` + `systemctl enable ufw` |
| **SSH** | `ssh.service` / `sshd.service` | Acesso remoto administrativo disponível logo após boot | `systemctl enable ssh` |

### 6.2. Script Utilitário Automatizado

Para inspecionar e forçar a habilitação de todos os serviços de uma só vez, execute o script incluído:

```bash
cd /opt/sglinux
sudo ./scripts/setup_boot_services.sh
```

### 6.3. Verificação Manual da Inicialização no Boot

Pode validar a qualquer momento o estado de inicialização automática de cada serviço:

```bash
# Deve retornar 'enabled' para todos os serviços essenciais:
systemctl is-enabled aster-servercore
systemctl is-enabled samba-ad-dc
systemctl is-enabled kea-dhcp4-server
systemctl is-enabled ufw
systemctl is-enabled ssh
```

---

## 🛡️ 7. Hardening e Boas Práticas em Produção

1. **Execução como Root no Systemd**:
   O ASTER ServerCore gerencia interfaces de rede (`netplan`), ficheiros em `/etc` protegidos, permissões do Kerberos e regras de firewall do kernel (`ufw`). Por isso, a unit `aster-servercore.service` executa com usuário `root` e `LimitNOFILE=65536`.
2. **Salvaguarda de SSH (Porta 22)**:
   O orquestrador e o serviço de firewall forçam a liberação de `22/tcp` antes de qualquer ativação do UFW, prevenindo bloqueio acidental do administrador remoto.
3. **Proxy Reverso Nginx com Suporte a WebSockets (Terminal & Telemetria)**:
   Para adicionar certificado SSL/TLS (HTTPS) e proteger o painel web em redes corporativas, utilize a configuração Nginx recomendada:

   ```nginx
   server {
       listen 443 ssl http2;
       server_name aster.empresa.local;

       ssl_certificate /etc/ssl/certs/aster.crt;
       ssl_certificate_key /etc/ssl/private/aster.key;

       # Endpoints HTTP da Aplicação Web
       location / {
           proxy_pass http://127.0.0.1:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       # WebSockets (Terminal xterm.js, Wizard e Telemetria em Tempo Real)
       location ~ ^/(ws|tasks/ws)/ {
           proxy_pass http://127.0.0.1:8000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_read_timeout 86400s;
           proxy_send_timeout 86400s;
       }
   }
   ```

---

## ❓ 8. Resolução de Problemas Comuns (Troubleshooting)

| Sintoma | Causa Mais Provável | Solução |
| :--- | :--- | :--- |
| **"bind 0.0.0.0:53 failed: Address already in use"** | O `systemd-resolved` ainda está escutando na porta 53. | O Wizard aplica a desativação via drop-in. Caso tenha sido iniciado manualmente, execute: `sudo systemctl restart systemd-resolved` e verifique com `sudo ss -tuln \| grep :53`. |
| **Estações Windows não ingressam no domínio** | O DNS das estações não aponta para o IP do Samba AD DC. | Verifique se o DHCP distribuiu o IP do servidor como DNS primário, ou configure manualmente o DNS da estação para o IP do servidor. |
| **Terminal WebSocket não conecta** | Firewall bloqueando ou proxy cortando cabeçalhos `Upgrade`. | Se usar Nginx ou Cloudflare, confirme se as diretivas de WebSocket (`Upgrade` e `Connection "upgrade"`) estão ativas. |
| **Aviso de permissão em `/var/log/sysmanager/`** | Diretório de logs não criado previamente. | O SGLinux cria automaticamente o diretório `/var/log/sysmanager`. Caso necessário, crie com `sudo mkdir -p /var/log/sysmanager`. |
