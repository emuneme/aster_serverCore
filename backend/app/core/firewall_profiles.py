"""
Perfis de regras de firewall para serviços de infraestrutura no Ubuntu Server.
Mapeia portas e protocolos exigidos por cada serviço essencial.
"""
from typing import Dict, List, TypedDict

class FirewallProfileMeta(TypedDict):
    name: str
    description: str
    ports: List[str]

FIREWALL_PROFILES: Dict[str, List[str]] = {
    "ssh": [
        "22/tcp"
    ],
    "dhcp": [
        "67/udp", 
        "68/udp"
    ],
    "dns": [
        "53/tcp", 
        "53/udp"
    ],
    "samba_ad": [
        "53/tcp", 
        "53/udp", 
        "88/tcp", 
        "88/udp", 
        "135/tcp", 
        "137/udp", 
        "138/udp", 
        "139/tcp", 
        "389/tcp", 
        "389/udp", 
        "445/tcp", 
        "464/tcp", 
        "464/udp", 
        "636/tcp", 
        "3268/tcp", 
        "3269/tcp", 
        "49152:65535/tcp"
    ]
}

PROFILE_DETAILS: Dict[str, FirewallProfileMeta] = {
    "ssh": {
        "name": "Acesso Seguro SSH",
        "description": "Porta 22/tcp para administração remota segura do Ubuntu Server",
        "ports": FIREWALL_PROFILES["ssh"]
    },
    "dhcp": {
        "name": "Servidor DHCP (Kea / Dnsmasq)",
        "description": "Portas 67/udp e 68/udp para distribuição dinâmica de endereços IP",
        "ports": FIREWALL_PROFILES["dhcp"]
    },
    "dns": {
        "name": "Servidor DNS (BIND9 / Samba)",
        "description": "Portas 53/tcp e 53/udp para resolução de nomes autoritativa e recursiva",
        "ports": FIREWALL_PROFILES["dns"]
    },
    "samba_ad": {
        "name": "Samba 4 Active Directory DC",
        "description": "Portas do domínio Windows AD: Kerberos, LDAP/S, SMB, NetBIOS, RPC Mapper e Dynamic RPC",
        "ports": FIREWALL_PROFILES["samba_ad"]
    }
}
