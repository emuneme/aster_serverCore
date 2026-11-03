#!/usr/bin/env bash
# ==============================================================================
# ASTER ServerCore — Instalador Automático de 1 Comando
# Compatível com Ubuntu Server 22.04 LTS e 24.04 LTS
# ==============================================================================

set -euo pipefail

# Cores para terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # Sem Cor

echo -e "${CYAN}==================================================================${NC}"
echo -e "${CYAN}${BOLD}       ASTER ServerCore — Instalação Automatizada em 1 Comando     ${NC}"
echo -e "${CYAN}   Gestão de Infraestrutura, Samba 4 AD DC, DHCP e Firewall       ${NC}"
echo -e "${CYAN}==================================================================${NC}\n"

# 1. Verificar privilégios de root
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}[ERRO] Este instalador precisa de privilégios de root.${NC}"
    echo -e "Por favor, execute: ${BOLD}sudo bash install.sh${NC} ou use ${BOLD}sudo${NC} no comando curl."
    exit 1
fi

# 2. Verificar se é sistema baseado em Debian/Ubuntu
if [ ! -f /etc/os-release ]; then
    echo -e "${RED}[ERRO] Sistema operacional não suportado. Requer Ubuntu/Debian.${NC}"
    exit 1
fi
. /etc/os-release
if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
    echo -e "${YELLOW}[AVISO] Este instalador foi otimizado para Ubuntu Server. Detectado: $NAME${NC}"
fi

INSTALL_DIR="/opt/sglinux"
REPO_URL="https://github.com/emuneme/aster_serverCore.git"

export DEBIAN_FRONTEND=noninteractive

echo -e "${BLUE}[1/6] Atualizando repositórios e instalando dependências base...${NC}"
apt-get update -q -y
apt-get install -y -q python3 python3-venv python3-pip git curl net-tools ufw acl

echo -e "\n${BLUE}[2/6] Baixando / Atualizando ASTER ServerCore em ${INSTALL_DIR}...${NC}"
if [ -d "${INSTALL_DIR}/.git" ]; then
    echo -e "Diretório existente detectado. Atualizando com git pull..."
    cd "${INSTALL_DIR}"
    git pull origin main
else
    if [ -d "${INSTALL_DIR}" ]; then
        mv "${INSTALL_DIR}" "${INSTALL_DIR}.bak-$(date +%s)"
    fi
    mkdir -p "${INSTALL_DIR}"
    git clone "${REPO_URL}" "${INSTALL_DIR}"
    cd "${INSTALL_DIR}"
fi

echo -e "\n${BLUE}[3/6] Configurando ambiente virtual Python (.venv)...${NC}"
cd "${INSTALL_DIR}"
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install -r backend/requirements.txt -q
echo -e "${GREEN}✔ Dependências do backend instaladas com sucesso.${NC}"

echo -e "\n${BLUE}[4/6] Verificando arquivos da interface web (Frontend)...${NC}"
if [ ! -f "${INSTALL_DIR}/frontend/dist/index.html" ]; then
    echo -e "${YELLOW}Frontend dist não encontrado. Compilando com Node.js...${NC}"
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y -q nodejs
    fi
    cd "${INSTALL_DIR}/frontend"
    npm install
    npm run build
    cd "${INSTALL_DIR}"
else
    echo -e "${GREEN}✔ Interface web pré-compilada pronta para servir.${NC}"
fi

echo -e "\n${BLUE}[5/6] Instalando e iniciando o serviço systemd (aster-servercore)...${NC}"
cp "${INSTALL_DIR}/systemd/aster-servercore.service" /etc/systemd/system/
rm -f /etc/systemd/system/sglinux.service 2>/dev/null || true
ln -sf /etc/systemd/system/aster-servercore.service /etc/systemd/system/sglinux.service
chmod +x "${INSTALL_DIR}/run.sh" 2>/dev/null || true
chmod +x "${INSTALL_DIR}/scripts/"*.sh 2>/dev/null || true

systemctl daemon-reload
systemctl enable aster-servercore
systemctl restart aster-servercore

echo -e "\n${BLUE}[6/6] Ajustando permissões de firewall e boot...${NC}"
# Liberar porta 22 (SSH) para segurança do administrador
ufw allow 22/tcp comment 'OpenSSH Safe Access' >/dev/null 2>&1 || true
# Liberar porta 8000 para acesso ao ASTER ServerCore Web
ufw allow 8000/tcp comment 'ASTER ServerCore Web UI' >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true

# Executar script de persistência de serviços no boot
if [ -f "${INSTALL_DIR}/scripts/setup_boot_services.sh" ]; then
    bash "${INSTALL_DIR}/scripts/setup_boot_services.sh"
fi

# Obter IPs para acesso
SERVER_IP=$(hostname -I | awk '{print $1}')
PUBLIC_IP=$(curl -s4 --max-time 3 ifconfig.me 2>/dev/null || echo "")

echo -e "\n${GREEN}==================================================================${NC}"
echo -e "${GREEN}${BOLD}     ✔ ASTER ServerCore instalado e iniciado com sucesso!        ${NC}"
echo -e "${GREEN}==================================================================${NC}\n"
echo -e "Você já pode acessar o painel de gerenciamento através do navegador:\n"
if [ -n "$PUBLIC_IP" ] && [ "$PUBLIC_IP" != "$SERVER_IP" ]; then
    echo -e "  🌐 Acesso Externo (VPS/Internet):  ${BOLD}http://${PUBLIC_IP}:8000${NC}"
fi
echo -e "  🏠 Acesso Interno / Local:         ${BOLD}http://${SERVER_IP}:8000${NC}"
echo -e "  📖 Documentação da API (Swagger):  ${BOLD}http://${SERVER_IP}:8000/docs${NC}\n"
echo -e "Comandos úteis:"
echo -e "  - Status do serviço:   ${CYAN}sudo systemctl status aster-servercore${NC}"
echo -e "  - Ver logs em tempo real: ${CYAN}sudo journalctl -u aster-servercore -f${NC}"
echo -e "  - Reiniciar serviço:   ${CYAN}sudo systemctl restart aster-servercore${NC}\n"
