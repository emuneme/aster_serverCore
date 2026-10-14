import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def get_auth_token():
    resp = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "SGLinux@Admin2026!"},
    )
    assert resp.status_code == 200
    return resp.json()["access_token"]


def test_monitor_snapshot():
    """Valida retorno completo do snapshot de telemetria do sistema e serviços."""
    response = client.get("/api/monitor/snapshot")
    assert response.status_code == 200
    data = response.json()

    # Validação Hardware/SO
    assert "timestamp" in data
    assert "cpu" in data
    assert "usage_percent" in data["cpu"]
    assert "cores_logical" in data["cpu"]
    assert "load_avg" in data["cpu"]
    assert len(data["cpu"]["load_avg"]) == 3

    assert "memory" in data
    assert data["memory"]["total_bytes"] > 0
    assert 0 <= data["memory"]["usage_percent"] <= 100

    assert "swap" in data
    assert "usage_percent" in data["swap"]

    assert "disks" in data
    assert isinstance(data["disks"], list)
    assert len(data["disks"]) >= 1
    mounts = [d["mountpoint"] for d in data["disks"]]
    assert "/" in mounts

    assert "network_io" in data
    assert "total_sent_per_sec" in data["network_io"]
    assert "total_recv_per_sec" in data["network_io"]
    assert "interfaces" in data["network_io"]

    assert "uptime" in data
    assert data["uptime"]["uptime_seconds"] >= 0
    assert len(data["uptime"]["formatted"]) > 0
    assert len(data["uptime"]["hostname"]) > 0

    # Validação Serviços
    assert "services" in data
    assert len(data["services"]) >= 4
    service_names = [s["name"] for s in data["services"]]
    assert "samba-ad-dc" in service_names
    assert "kea-dhcp4-server" in service_names
    assert "ufw" in service_names
    assert "ssh" in service_names

    assert "dns_port_53_open" in data


def test_monitor_control_service():
    """Testa execução de start, stop e restart em serviços gerenciáveis com autenticação."""
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Stop
    resp_stop = client.post("/api/monitor/service/samba-ad-dc/stop", headers=headers)
    assert resp_stop.status_code == 200
    data_stop = resp_stop.json()
    assert data_stop["service"] == "samba-ad-dc"
    assert data_stop["action"] == "stop"
    assert data_stop["success"] is True

    # 2. Restart
    resp_restart = client.post("/api/monitor/service/samba-ad-dc/restart", headers=headers)
    assert resp_restart.status_code == 200
    data_restart = resp_restart.json()
    assert data_restart["service"] == "samba-ad-dc"
    assert data_restart["action"] == "restart"
    assert data_restart["active"] is True


def test_monitor_control_service_unauthorized():
    """Garante que requisição sem token retorne 401 Unauthorized."""
    resp = client.post("/api/monitor/service/samba-ad-dc/restart")
    assert resp.status_code == 401


def test_monitor_control_service_errors():
    """Testa tratamento de serviço inexistente (404) e ação inválida (400)."""
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Serviço desconhecido
    resp_404 = client.post("/api/monitor/service/servico_inexistente/start", headers=headers)
    assert resp_404.status_code == 404

    # Ação desconhecida
    resp_400 = client.post("/api/monitor/service/samba-ad-dc/acao_invalida", headers=headers)
    assert resp_400.status_code == 400


def test_monitor_service_logs():
    """Testa obtenção das últimas linhas do journalctl do serviço."""
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.get("/api/monitor/logs/kea-dhcp4-server?lines=20", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["service"] == "kea-dhcp4-server"
    assert "lines" in data
    assert isinstance(data["lines"], list)
    assert len(data["lines"]) > 0


def test_monitor_websocket_stream():
    """Testa conexão e recepção de payload no WebSocket /ws/monitor."""
    with client.websocket_connect("/ws/monitor") as websocket:
        data = websocket.receive_json()
        assert "timestamp" in data
        assert "cpu" in data
        assert "memory" in data
        assert "services" in data
