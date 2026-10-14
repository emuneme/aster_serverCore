import os
import pytest
import asyncio
from pathlib import Path
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.core.executor import executor

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "SGLinux" in data["project"]

def test_system_info():
    response = client.get("/api/system/info")
    assert response.status_code == 200
    data = response.json()
    assert "hostname" in data
    assert "cpu" in data
    assert "memory" in data
    assert "disk" in data

def test_network_interfaces():
    response = client.get("/api/network/interfaces")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0

def test_samba_status():
    response = client.get("/api/samba/status")
    assert response.status_code == 200
    data = response.json()
    assert "is_installed" in data
    assert "is_provisioned" in data

def test_firewall_status():
    response = client.get("/api/firewall/status")
    assert response.status_code == 200
    data = response.json()
    assert "active" in data
    assert "rules" in data

@pytest.mark.asyncio
async def test_background_task_execution():
    # Trigger a task via executor with list args
    task = executor.run_command(
        command=["echo", "SGLinux test command execution"],
        description="Teste automatizado de execução com lista de argumentos",
        simulate=True
    )
    assert task.id is not None
    assert task.command_args == ["echo", "SGLinux test command execution"]

    # Allow simulated task coroutine to start
    await asyncio.sleep(0.5)

    # Query task via API
    response = client.get(f"/api/tasks/{task.id}")
    assert response.status_code == 200
    task_data = response.json()
    assert task_data["id"] == task.id
    assert task_data["status"] in ("running", "completed")

@pytest.mark.asyncio
async def test_subprocess_exec_list_args_and_dedicated_log():
    # Ensure log directory exists
    log_dir = settings.LOG_DIR
    assert log_dir.exists()

    cmd_args = ["apt-get", "install", "-y", "samba", "winbind"]
    task = executor.run_command(
        command=cmd_args,
        description="Instalação segura com lista de argumentos e log dedicado",
        simulate=True
    )

    assert task.id is not None
    assert task.command_args == cmd_args
    assert task.log_file is not None

    log_file_path = Path(task.log_file)
    assert log_file_path.name == f"install_{task.id}.log"
    assert log_file_path.exists()

    # Wait for execution and finalization
    await asyncio.sleep(1.0)

    # Read log file from disk
    content = log_file_path.read_text(encoding="utf-8")
    assert "SGLinux Audit Log" in content
    assert task.id in content
    assert "apt-get install -y samba winbind" in content

    # Test API endpoint to retrieve log
    res = client.get(f"/api/tasks/{task.id}/log")
    assert res.status_code == 200
    assert "SGLinux Audit Log" in res.text

def test_samba_preflight_and_state_verification():
    # 1. Clean previous state if present in simulation mock
    sam_path = settings.SAMBA_SAM_LDB
    if sam_path.exists():
        sam_path.unlink()

    # 2. Preflight endpoint check
    pre_res = client.get("/api/samba/preflight")
    assert pre_res.status_code == 200
    pre_data = pre_res.json()
    assert "can_provision" in pre_data
    assert pre_data["sam_ldb_exists"] is False

    # 3. Provisioning payload
    payload = {
        "realm": "AUDIT.LOCAL",
        "domain": "AUDIT",
        "admin_password": "ComplexP@ssw0rd2026!",
        "dns_backend": "SAMBA_INTERNAL",
        "dns_forwarder": "8.8.8.8",
        "force": False
    }

    # 4. First provision should succeed
    prov1 = client.post("/api/samba/provision", json=payload)
    assert prov1.status_code == 200
    data1 = prov1.json()
    assert "task_id" in data1
    assert "log_file" in data1
    assert Path(data1["log_file"]).exists()

    # 5. Second provision without force MUST be blocked with 409 Conflict
    prov2 = client.post("/api/samba/provision", json=payload)
    assert prov2.status_code == 409
    assert "Estado prévio detectado" in prov2.json()["detail"]
    assert "sam.ldb" in prov2.json()["detail"]

    # 6. Third provision with force=True MUST be allowed
    payload["force"] = True
    prov3 = client.post("/api/samba/provision", json=payload)
    assert prov3.status_code == 200
    assert "task_id" in prov3.json()

def test_network_apply_simple_and_validation():
    # Test valid configuration
    valid_payload = {
        "interface": "eth0",
        "address": "192.168.1.50/24",
        "gateway": "192.168.1.1",
        "nameservers": ["127.0.0.1", "1.1.1.1"]
    }
    res = client.post("/api/network/apply", json=valid_payload)
    assert res.status_code == 200
    data = res.json()
    assert "task_id" in data
    assert "log_file" in data
    assert Path(data["log_file"]).exists()

    # Test invalid CIDR address
    bad_payload = {
        "interface": "eth0",
        "address": "192.168.1.50", # missing mask
        "gateway": "192.168.1.1",
        "nameservers": ["127.0.0.1"]
    }
    res_bad = client.post("/api/network/apply", json=bad_payload)
    assert res_bad.status_code == 400
    assert "máscara" in res_bad.json()["detail"] or "inválido" in res_bad.json()["detail"]

def test_network_ws_apply_execution():
    with client.websocket_connect("/api/network/ws/apply") as websocket:
        payload = {
            "interface": "eth0",
            "address": "10.0.0.25/24",
            "gateway": "10.0.0.1",
            "nameservers": ["127.0.0.1"]
        }
        websocket.send_json(payload)
        received_types = []
        for _ in range(3):
            msg = websocket.receive_json()
            received_types.append(msg.get("type"))
            assert "task_id" in msg
        assert "status" in received_types or "started" in received_types

def test_kea_dhcp_status_endpoint():
    res = client.get("/api/dhcp/status")
    assert res.status_code == 200
    data = res.json()
    assert "active" in data
    assert "installed" in data
    assert "config_path" in data

def test_kea_dhcp_leases_endpoint():
    res = client.get("/api/dhcp/leases")
    assert res.status_code == 200
    leases = res.json()
    assert isinstance(leases, list)
    if leases:
        first = leases[0]
        assert "ip_address" in first
        assert "mac_address" in first

def test_kea_dhcp_apply_endpoint():
    payload = {
        "interface": "eth0",
        "subnet": "192.168.1.0/24",
        "pool_start": "192.168.1.100",
        "pool_end": "192.168.1.200",
        "routers": ["192.168.1.1"],
        "dns_servers": ["127.0.0.1", "8.8.8.8"],
        "lease_time": 86400
    }
    res = client.post("/api/dhcp/apply", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "task_id" in data
    assert "config_path" in data
    assert Path(data["config_path"]).exists()

def test_kea_dhcp_ws_apply_execution():
    with client.websocket_connect("/ws/dhcp/apply") as websocket:
        payload = {
            "interface": "eth0",
            "subnet": "192.168.100.0/24",
            "pool_start": "192.168.100.10",
            "pool_end": "192.168.100.50",
            "routers": ["192.168.100.1"],
            "dns_servers": ["127.0.0.1"],
            "lease_time": 43200
        }
        websocket.send_json(payload)
        
        # Recebe primeiras mensagens
        received_types = []
        for _ in range(3):
            msg = websocket.receive_json()
            received_types.append(msg.get("type"))
        assert any(t in received_types for t in ("log", "status", "started"))


def test_firewall_status_and_profiles_endpoints():
    # 1. Status
    res = client.get("/api/firewall/status")
    assert res.status_code == 200
    data = res.json()
    assert "active" in data
    assert "rules" in data
    assert isinstance(data["rules"], list)

    # 2. List Profiles
    res_prof = client.get("/api/firewall/profiles")
    assert res_prof.status_code == 200
    profiles = res_prof.json()
    assert len(profiles) >= 4
    keys = [p["key"] for p in profiles]
    assert "ssh" in keys
    assert "dhcp" in keys
    assert "dns" in keys
    assert "samba_ad" in keys


def test_firewall_toggle_and_rule_management():
    # Toggle UFW
    res_toggle = client.post("/api/firewall/toggle", json={"enabled": True})
    assert res_toggle.status_code == 200
    assert "task_id" in res_toggle.json()

    # Apply Profiles (ex: ssh e dns)
    res_apply = client.post("/api/firewall/profiles/apply", json={"profiles": ["ssh", "dns"]})
    assert res_apply.status_code == 200
    assert "task_id" in res_apply.json()

    # Add custom rule
    rule_payload = {
        "action": "allow",
        "direction": "in",
        "protocol": "tcp",
        "port": "8080",
        "from_ip": "192.168.1.0/24",
        "comment": "Custom Web Port"
    }
    res_rule = client.post("/api/firewall/rule", json=rule_payload)
    assert res_rule.status_code == 200
    assert "task_id" in res_rule.json()

    # Delete rule by index
    res_del = client.delete("/api/firewall/rule/1")
    assert res_del.status_code == 200
    assert "task_id" in res_del.json()


def test_firewall_nat_routing_configuration():
    # Configurar NAT
    nat_payload = {
        "enabled": True,
        "wan_interface": "eth0",
        "lan_interface": "eth1",
        "lan_subnet": "192.168.1.0/24"
    }
    res_nat = client.post("/api/firewall/nat", json=nat_payload)
    assert res_nat.status_code == 200
    data = res_nat.json()
    assert data["enabled"] is True
    assert data["wan_interface"] == "eth0"
    assert data["lan_interface"] == "eth1"

    # Status NAT
    res_status = client.get("/api/firewall/nat")
    assert res_status.status_code == 200
    status_data = res_status.json()
    assert "enabled" in status_data
    assert "ip_forwarding" in status_data
    assert status_data["ip_forwarding"] is True

    # Desativar NAT
    nat_disable = {
        "enabled": False,
        "wan_interface": "eth0",
        "lan_interface": "eth1"
    }
    res_dis = client.post("/api/firewall/nat", json=nat_disable)
    assert res_dis.status_code == 200
    assert res_dis.json()["enabled"] is False


def test_wizard_validate_endpoint():
    payload = {
        "network_interface": "eth0",
        "server_ip_cidr": "192.168.1.10/24",
        "gateway": "192.168.1.1",
        "upstream_dns": ["8.8.8.8", "1.1.1.1"],
        "realm": "EMPRESA.LOCAL",
        "domain": "EMPRESA",
        "admin_password": "AdminPassword2026!",
        "enable_dhcp": True,
        "dhcp_pool_start": "192.168.1.100",
        "dhcp_pool_end": "192.168.1.200",
        "lease_time": 86400,
        "enable_firewall": True,
        "allow_ssh": True
    }
    response = client.post("/api/wizard/validate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is True
    assert data["server_ip_cidr"] == "192.168.1.10/24"
    assert data["realm"] == "EMPRESA.LOCAL"


def test_wizard_websocket_execution():
    payload = {
        "network_interface": "eth0",
        "server_ip_cidr": "192.168.1.10/24",
        "gateway": "192.168.1.1",
        "upstream_dns": ["8.8.8.8", "1.1.1.1"],
        "realm": "EMPRESA.LOCAL",
        "domain": "EMPRESA",
        "admin_password": "AdminPassword2026!",
        "enable_dhcp": True,
        "dhcp_pool_start": "192.168.1.100",
        "dhcp_pool_end": "192.168.1.200",
        "lease_time": 86400,
        "enable_firewall": True,
        "allow_ssh": True
    }

    with client.websocket_connect("/ws/wizard/execute") as websocket:
        websocket.send_json(payload)

        # Recebe mensagens transmitidas pelo orquestrador
        messages = []
        completed = False
        for _ in range(300):
            try:
                msg = websocket.receive_json()
                messages.append(msg)
                if msg.get("type") == "completed":
                    completed = True
                    break
                if msg.get("type") == "error":
                    break
            except Exception:
                break

        assert completed is True
        progress_msgs = [m for m in messages if m.get("type") == "progress"]
        assert len(progress_msgs) > 0
        final_msg = [m for m in messages if m.get("type") == "completed"][0]
        assert final_msg["percent"] == 100
        assert final_msg["summary"]["realm"] == "EMPRESA.LOCAL"


def test_auth_server_status():
    response = client.get("/api/auth/status")
    assert response.status_code == 200
    data = response.json()
    assert "hostname" in data
    assert "os_name" in data
    assert "is_production" in data
    assert "version" in data


def test_auth_login_successful_local_admin():
    response = client.post(
        "/api/auth/login",
        json={"username": settings.ADMIN_USER, "password": settings.ADMIN_PASSWORD}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user_info"]["username"] == settings.ADMIN_USER
    assert data["user_info"]["auth_type"] == "local"
    assert data["server_info"]["hostname"] is not None


def test_auth_login_successful_simulation_pam():
    # Em modo de simulação, utilizadores como 'ubuntu' e 'root' são aceites para teste
    response = client.post(
        "/api/auth/login",
        json={"username": "ubuntu", "password": "ubuntu"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user_info"]["username"] == "ubuntu"
    assert data["user_info"]["auth_type"] == "pam"


def test_auth_login_invalid_credentials():
    response = client.post(
        "/api/auth/login",
        json={"username": "usuario_ficticio", "password": "senha_totalmente_errada"}
    )
    assert response.status_code == 401
    assert "Credenciais inválidas" in response.json()["detail"]


def test_auth_me_endpoint_with_valid_token():
    # Faz login primeiro
    login_resp = client.post(
        "/api/auth/login",
        json={"username": settings.ADMIN_USER, "password": settings.ADMIN_PASSWORD}
    )
    token = login_resp.json()["access_token"]

    # Consulta /me com header Authorization
    me_resp = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert me_resp.status_code == 200
    user_data = me_resp.json()
    assert user_data["username"] == settings.ADMIN_USER


def test_auth_me_endpoint_without_token():
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_auth_logout():
    login_resp = client.post(
        "/api/auth/login",
        json={"username": settings.ADMIN_USER, "password": settings.ADMIN_PASSWORD}
    )
    token = login_resp.json()["access_token"]

    logout_resp = client.post(
        "/api/auth/logout",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert logout_resp.status_code == 200
    assert "encerrada com sucesso" in logout_resp.json()["message"]




