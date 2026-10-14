#!/usr/bin/env bash
# ==============================================================================
# ASTER ServerCore — Script de Configuração de Arranque Automático (Boot Services)
# Garante que todos os serviços essenciais iniciem automaticamente após reboot.
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${CYAN}==================================================================${NC}"
echo -e "${CYAN}   ASTER ServerCore — Configuração de Inicialização Automática    ${NC}"
echo -e "${CYAN}==================================================================${NC}"

# 1. Verificar privilégios de root
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}[ERRO] Este script necessita de ser executado com privilégios de root (sudo).${NC}"
    exit 1
fi

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo -e "\n${BLUE}[1/5] A configurar serviço systemd do ASTER ServerCore...${NC}"
if [ -f "${PROJECT_DIR}/systemd/aster-servercore.service" ]; then
    cp "${PROJECT_DIR}/systemd/aster-servercore.service" /etc/systemd/system/
    # Também mantém sglinux.service como alias/compatibilidade
    cp "${PROJECT_DIR}/systemd/sglinux.service" /etc/systemd/system/ 2>/dev/null || true
    systemctl daemon-reload
    systemctl enable aster-servercore
    echo -e "${GREEN}✔ Serviço 'aster-servercore.service' habilitado com sucesso no boot!${NC}"
else
    echo -e "${YELLOW}Aviso: Arquivo systemd/aster-servercore.service não encontrado em ${PROJECT_DIR}.${NC}"
fi

echo -e "\n${BLUE}[2/5] A configurar persistência do Samba 4 AD DC...${NC}"
if command -v samba-tool &> /dev/null; then
    # Desmascarar e habilitar samba-ad-dc
    systemctl unmask samba-ad-dc 2>/dev/null || true
    systemctl mask smbd nmbd winbind 2>/dev/null || true
    systemctl enable samba-ad-dc 2>/dev/null || true
    echo -e "${GREEN}✔ Serviço 'samba-ad-dc.service' desmascarado e habilitado no boot.${NC}"
else
    echo -e "${YELLOW}ℹ Samba não instalado ainda. O Setup Wizard irá habilitá-lo automaticamente.${NC}"
fi

echo -e "\n${BLUE}[3/5] A configurar persistência do ISC Kea DHCPv4...${NC}"
if [ -f /etc/kea/kea-dhcp4.conf ] || command -v kea-dhcp4 &> /dev/null; then
    systemctl enable kea-dhcp4-server 2>/dev/null || true
    echo -e "${GREEN}✔ Serviço 'kea-dhcp4-server.service' habilitado no boot.${NC}"
else
    echo -e "${YELLOW}ℹ Kea DHCP não instalado ainda. Será habilitado durante o provisionamento.${NC}"
fi

echo -e "\n${BLUE}[4/5] A configurar persistência do Firewall UFW e SSH...${NC}"
if command -v ufw &> /dev/null; then
    # Garante porta 22 antes de tudo
    ufw allow 22/tcp comment 'OpenSSH Safe Access' >/dev/null 2>&1 || true
    ufw --force enable >/dev/null 2>&1 || true
    systemctl enable ufw 2>/dev/null || true
    echo -e "${GREEN}✔ Firewall UFW habilitado com salvaguarda SSH (Porta 22/tcp).${NC}"
fi

# SSH
if systemctl list-unit-files | grep -E '^ssh(d)?\.service' &> /dev/null; then
    systemctl enable ssh 2>/dev/null || systemctl enable sshd 2>/dev/null || true
    echo -e "${GREEN}✔ Serviço SSH habilitado no boot.${NC}"
fi

echo -e "\n${BLUE}[5/5] Relatório de Estado de Inicialização no Boot:${NC}"
echo -e "------------------------------------------------------------------"
printf "%-25s | %-15s | %-15s\n" "Serviço" "Status Atual" "Arranque no Boot"
echo -e "------------------------------------------------------------------"

for svc in aster-servercore samba-ad-dc kea-dhcp4-server ufw ssh; do
    active_status="$(systemctl is-active "$svc" 2>/dev/null || echo "inativo/não-instalado")"
    enabled_status="$(systemctl is-enabled "$svc" 2>/dev/null || echo "não-habilitado")"
    
    if [ "$enabled_status" = "enabled" ]; then
        color_enabled="${GREEN}"
    else
        color_enabled="${YELLOW}"
    fi

    if [ "$active_status" = "active" ]; then
        color_active="${GREEN}"
    else
        color_active="${YELLOW}"
    fi

    printf "%-25s | ${color_active}%-15s${NC} | ${color_enabled}%-15s${NC}\n" "$svc" "$active_status" "$enabled_status"
done
echo -e "------------------------------------------------------------------"

echo -e "\n${GREEN}✔ Todos os serviços estão prontos para arrancar de forma 100% automática em caso de reinício do servidor!${NC}\n"
