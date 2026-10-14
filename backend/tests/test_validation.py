import pytest
from pydantic import ValidationError

from ipaddress import IPv4Address
from app.models.network import EthernetInterface, NameserverConfig, NetplanConfig
from app.models.samba import SambaProvisionRequest, DnsBackendType
from app.models.dhcp import DhcpConfig, DhcpSubnetConfig, DhcpReservation, DhcpBackendType
from app.schemas import DhcpConfigRequest
from app.models.firewall import UfwRuleCreate, UfwAction, UfwProtocol, UfwDirection
from app.core.templates import render_netplan, render_samba, render_kea, render_dnsmasq

# --- 1. Netplan & Network Validation ---

def test_valid_netplan_config():
    iface = EthernetInterface(
        name="enp0s3",
        dhcp4=False,
        addresses=["192.168.1.10/24"],
        gateway4="192.168.1.1",
        nameservers=NameserverConfig(
            addresses=["192.168.1.1", "8.8.8.8"],
            search=["empresa.local"]
        )
    )
    config = NetplanConfig(renderer="networkd", ethernets={"enp0s3": iface})
    rendered = render_netplan(config)

    assert "enp0s3:" in rendered
    assert "dhcp4: false" in rendered
    assert "192.168.1.10/24" in rendered
    assert "via: 192.168.1.1" in rendered
    assert "8.8.8.8" in rendered

def test_invalid_netplan_cidr():
    with pytest.raises(ValidationError):
        EthernetInterface(
            name="eth0",
            addresses=["999.999.999.999/24"]
        )

def test_invalid_netplan_gateway():
    with pytest.raises(ValidationError):
        EthernetInterface(
            name="eth0",
            gateway4="invalid-ip"
        )

# --- 2. Samba 4 AD DC Validation ---

def test_valid_samba_provision_request():
    req = SambaProvisionRequest(
        realm="CORP.LOCAL",
        domain="CORP",
        admin_password="ComplexP@ssw0rd2026!",
        dns_backend=DnsBackendType.SAMBA_INTERNAL,
        dns_forwarder="1.1.1.1"
    )
    assert req.realm == "CORP.LOCAL"
    assert req.domain == "CORP"

    rendered = render_samba(req)
    assert "realm = CORP.LOCAL" in rendered
    assert "workgroup = CORP" in rendered
    assert "dns forwarder = 1.1.1.1" in rendered

def test_samba_realm_must_have_dot():
    with pytest.raises(ValidationError) as exc:
        SambaProvisionRequest(
            realm="CORPLOCALWITHOUTDOT",
            domain="CORP",
            admin_password="ComplexP@ssw0rd2026!"
        )
    assert "Realm inválido" in str(exc.value)

def test_samba_domain_netbios_max_length():
    with pytest.raises(ValidationError) as exc:
        SambaProvisionRequest(
            realm="CORP.LOCAL",
            domain="THISISLONGERTHAN15CHARS",
            admin_password="ComplexP@ssw0rd2026!"
        )
    assert "15 caracteres" in str(exc.value)

def test_samba_password_complexity():
    # Missing special character
    with pytest.raises(ValidationError) as exc:
        SambaProvisionRequest(
            realm="CORP.LOCAL",
            domain="CORP",
            admin_password="Password1234"
        )
    assert "caractere especial" in str(exc.value)

    # Too short (< 8 chars)
    with pytest.raises(ValidationError) as exc:
        SambaProvisionRequest(
            realm="CORP.LOCAL",
            domain="CORP",
            admin_password="P@1"
        )
    assert "pelo menos 8 caracteres" in str(exc.value)

    # Missing uppercase
    with pytest.raises(ValidationError) as exc:
        SambaProvisionRequest(
            realm="CORP.LOCAL",
            domain="CORP",
            admin_password="p@ssword1234"
        )
    assert "letra maiúscula" in str(exc.value)

# --- 3. DHCP Subnet and Pool Range Validation ---

def test_valid_dhcp_subnet_and_pools():
    subnet = DhcpSubnetConfig(
        subnet="192.168.10.0/24",
        pool_start="192.168.10.100",
        pool_end="192.168.10.200",
        gateway="192.168.10.1",
        dns_servers=["192.168.10.1"],
        reservations=[
            DhcpReservation(
                hostname="printer",
                mac_address="00:11:22:33:44:55",
                ip_address="192.168.10.20"
            )
        ]
    )
    config = DhcpConfig(
        backend=DhcpBackendType.KEA,
        interface="eth0",
        subnets=[subnet]
    )
    rendered = render_kea(config)
    assert "192.168.10.0/24" in rendered
    assert "192.168.10.100 - 192.168.10.200" in rendered
    assert "00:11:22:33:44:55" in rendered

def test_dhcp_pool_outside_subnet():
    with pytest.raises(ValidationError) as exc:
        DhcpSubnetConfig(
            subnet="192.168.10.0/24",
            pool_start="10.0.0.1",
            pool_end="192.168.10.200"
        )
    assert "não pertence à sub-rede" in str(exc.value)

def test_dhcp_pool_start_greater_than_end():
    with pytest.raises(ValidationError) as exc:
        DhcpSubnetConfig(
            subnet="192.168.10.0/24",
            pool_start="192.168.10.200",
            pool_end="192.168.10.100"
        )
    assert "não pode ser maior" in str(exc.value)

def test_invalid_mac_address():
    with pytest.raises(ValidationError):
        DhcpReservation(
            mac_address="NOT-A-MAC",
            ip_address="192.168.10.20"
        )

# Testes para DhcpConfigRequest (Requisito 1)
def test_valid_dhcp_config_request():
    req = DhcpConfigRequest(
        interface="eth0",
        subnet="192.168.1.0/24",
        pool_start=IPv4Address("192.168.1.100"),
        pool_end=IPv4Address("192.168.1.200"),
        routers=[IPv4Address("192.168.1.1")],
        dns_servers=[IPv4Address("127.0.0.1"), IPv4Address("8.8.8.8")],
        lease_time=86400
    )
    assert req.interface == "eth0"
    assert str(req.pool_start) == "192.168.1.100"
    assert req.lease_time == 86400

def test_dhcp_config_request_pool_outside_subnet():
    with pytest.raises(ValidationError) as exc:
        DhcpConfigRequest(
            interface="eth0",
            subnet="192.168.1.0/24",
            pool_start=IPv4Address("10.0.0.50"), # Fora da sub-rede 192.168.1.0/24
            pool_end=IPv4Address("192.168.1.200")
        )
    assert "não pertence à sub-rede" in str(exc.value)

def test_dhcp_config_request_start_greater_than_end():
    with pytest.raises(ValidationError) as exc:
        DhcpConfigRequest(
            interface="eth0",
            subnet="192.168.1.0/24",
            pool_start=IPv4Address("192.168.1.200"),
            pool_end=IPv4Address("192.168.1.50")
        )
    assert "não pode ser maior" in str(exc.value)

def test_dhcp_config_request_router_outside_subnet():
    with pytest.raises(ValidationError) as exc:
        DhcpConfigRequest(
            interface="eth0",
            subnet="192.168.1.0/24",
            pool_start=IPv4Address("192.168.1.10"),
            pool_end=IPv4Address("192.168.1.50"),
            routers=[IPv4Address("172.16.0.1")] # Fora da sub-rede
        )
    assert "não pertence à sub-rede" in str(exc.value)

# --- 4. Firewall UFW Rule Validation ---

def test_valid_firewall_rule():
    rule = UfwRuleCreate(
        action=UfwAction.ALLOW,
        port="443",
        protocol=UfwProtocol.TCP,
        direction=UfwDirection.IN,
        from_ip="192.168.1.0/24",
        comment="HTTPS Web Portal"
    )
    assert rule.port == "443"

def test_invalid_firewall_port():
    with pytest.raises(ValidationError):
        UfwRuleCreate(
            action=UfwAction.ALLOW,
            port="70000",
            protocol=UfwProtocol.TCP
        )

def test_firewall_service_profiles_mapping():
    from app.core.firewall_profiles import FIREWALL_PROFILES, PROFILE_DETAILS

    assert "ssh" in FIREWALL_PROFILES
    assert FIREWALL_PROFILES["ssh"] == ["22/tcp"]

    assert "dhcp" in FIREWALL_PROFILES
    assert FIREWALL_PROFILES["dhcp"] == ["67/udp", "68/udp"]

    assert "dns" in FIREWALL_PROFILES
    assert FIREWALL_PROFILES["dns"] == ["53/tcp", "53/udp"]

    assert "samba_ad" in FIREWALL_PROFILES
    samba_ports = FIREWALL_PROFILES["samba_ad"]
    expected_samba = [
        "53/tcp", "53/udp", "88/tcp", "88/udp", "135/tcp", 
        "137/udp", "138/udp", "139/tcp", "389/tcp", "389/udp", 
        "445/tcp", "464/tcp", "464/udp", "636/tcp", "3268/tcp", 
        "3269/tcp", "49152:65535/tcp"
    ]
    assert samba_ports == expected_samba

def test_nat_config_request_validation():
    from app.models.firewall import NatConfigRequest

    valid_nat = NatConfigRequest(
        enabled=True,
        wan_interface="eth0",
        lan_interface="eth1",
        lan_subnet="192.168.1.0/24"
    )
    assert valid_nat.wan_interface == "eth0"
    assert valid_nat.lan_subnet == "192.168.1.0/24"

    # Subnet inválida
    with pytest.raises(ValidationError) as exc:
        NatConfigRequest(
            enabled=True,
            wan_interface="eth0",
            lan_interface="eth1",
            lan_subnet="not-an-ip-range"
        )
    assert "Sub-rede LAN inválida" in str(exc.value)


# --- 6. WizardSetupRequest Validation Tests ---

def test_valid_wizard_setup_request():
    from app.schemas import WizardSetupRequest

    req = WizardSetupRequest(
        network_interface="eth0",
        server_ip_cidr="192.168.1.10/24",
        gateway=IPv4Address("192.168.1.1"),
        upstream_dns=[IPv4Address("8.8.8.8"), IPv4Address("1.1.1.1")],
        realm="EMPRESA.LOCAL",
        domain="EMPRESA",
        admin_password="AdminPassword2026!",
        enable_dhcp=True,
        dhcp_pool_start=IPv4Address("192.168.1.100"),
        dhcp_pool_end=IPv4Address("192.168.1.200"),
        lease_time=86400,
        enable_firewall=True,
        allow_ssh=True
    )
    assert req.network_interface == "eth0"
    assert req.server_ip_cidr == "192.168.1.10/24"
    assert req.realm == "EMPRESA.LOCAL"
    assert req.domain == "EMPRESA"
    assert req.allow_ssh is True


def test_wizard_invalid_cidr():
    from app.schemas import WizardSetupRequest

    with pytest.raises(ValidationError) as exc:
        WizardSetupRequest(
            network_interface="eth0",
            server_ip_cidr="192.168.1.10", # Sem máscara
            realm="EMPRESA.LOCAL",
            domain="EMPRESA",
            admin_password="AdminPassword2026!"
        )
    assert "O IP deve incluir a máscara CIDR" in str(exc.value)


def test_wizard_invalid_password():
    from app.schemas import WizardSetupRequest

    with pytest.raises(ValidationError) as exc:
        WizardSetupRequest(
            network_interface="eth0",
            server_ip_cidr="192.168.1.10/24",
            realm="EMPRESA.LOCAL",
            domain="EMPRESA",
            admin_password="fraca" # < 8 chars, sem maiúscula, etc.
        )
    assert "pelo menos 8 caracteres" in str(exc.value)


def test_wizard_dhcp_pool_out_of_subnet():
    from app.schemas import WizardSetupRequest

    with pytest.raises(ValidationError) as exc:
        WizardSetupRequest(
            network_interface="eth0",
            server_ip_cidr="192.168.1.10/24",
            realm="EMPRESA.LOCAL",
            domain="EMPRESA",
            admin_password="AdminPassword2026!",
            enable_dhcp=True,
            dhcp_pool_start=IPv4Address("10.0.0.100"), # Fora da 192.168.1.0/24
            dhcp_pool_end=IPv4Address("10.0.0.200")
        )
    assert "não pertence à sub-rede" in str(exc.value)


def test_wizard_dhcp_start_greater_than_end():
    from app.schemas import WizardSetupRequest

    with pytest.raises(ValidationError) as exc:
        WizardSetupRequest(
            network_interface="eth0",
            server_ip_cidr="192.168.1.10/24",
            realm="EMPRESA.LOCAL",
            domain="EMPRESA",
            admin_password="AdminPassword2026!",
            enable_dhcp=True,
            dhcp_pool_start=IPv4Address("192.168.1.200"),
            dhcp_pool_end=IPv4Address("192.168.1.100") # menor que start
        )
    assert "não pode ser maior que o final" in str(exc.value)


