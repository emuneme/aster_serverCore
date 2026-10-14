<template>
  <div class="dhcp-container">
    <!-- Cabeçalho e Status do Serviço -->
    <div class="dhcp-card">
      <div class="header-row">
        <div>
          <h2 class="title">Servidor Kea DHCPv4 (ISC Kea)</h2>
          <p class="subtitle">
            Gestão declarativa do serviço kea-dhcp4-server no Ubuntu Server com validação de sintaxe e concessões em tempo real.
          </p>
        </div>

        <div class="status-badge-container">
          <span 
            class="service-badge" 
            :class="serviceStatus?.active ? 'badge-active' : 'badge-inactive'"
          >
            <span class="status-dot"></span>
            {{ serviceStatus?.active ? 'ATIVO (RUNNING)' : 'INATIVO' }}
          </span>
          <button @click="loadStatusAndLeases" class="btn-refresh" :disabled="loadingLeases">
            Recarregar
          </button>
        </div>
      </div>

      <!-- Alerta de Feedback -->
      <div v-if="feedback" :class="feedback.type === 'success' ? 'alert-success' : 'alert-error'">
        {{ feedback.text }}
      </div>

      <!-- Formulário de Configuração Kea DHCP -->
      <div class="form-grid">
        <!-- 1. Interface -->
        <div class="form-group">
          <label for="dhcp-iface">Interface de Rede</label>
          <select id="dhcp-iface" v-model="form.interface" class="input-control" :disabled="isApplying">
            <option v-for="iface in detectedInterfaces" :key="iface.name" :value="iface.name">
              {{ iface.name }} — {{ iface.is_up ? 'Online' : 'Down' }}
            </option>
            <option value="*">* (Todas as interfaces)</option>
          </select>
          <small class="help-text">Placa onde o Kea responderá às requisições DHCPDISCOVER.</small>
        </div>

        <!-- 2. Sub-rede CIDR -->
        <div class="form-group">
          <label for="dhcp-subnet">Sub-rede (CIDR) <span class="req">*</span></label>
          <input
            id="dhcp-subnet"
            v-model="form.subnet"
            type="text"
            placeholder="Ex: 192.168.1.0/24"
            class="input-control font-mono"
            :disabled="isApplying"
          />
          <small class="help-text">Endereço da rede com máscara (ex: 192.168.1.0/24).</small>
        </div>

        <!-- 3. Pool Start -->
        <div class="form-group">
          <label for="dhcp-pool-start">Primeiro IP do Pool (Início) <span class="req">*</span></label>
          <input
            id="dhcp-pool-start"
            v-model="form.pool_start"
            type="text"
            placeholder="Ex: 192.168.1.100"
            class="input-control font-mono"
            :disabled="isApplying"
          />
          <small class="help-text">Primeiro endereço distribuído dinamicamente.</small>
        </div>

        <!-- 4. Pool End -->
        <div class="form-group">
          <label for="dhcp-pool-end">Último IP do Pool (Fim) <span class="req">*</span></label>
          <input
            id="dhcp-pool-end"
            v-model="form.pool_end"
            type="text"
            placeholder="Ex: 192.168.1.200"
            class="input-control font-mono"
            :disabled="isApplying"
          />
          <small class="help-text">Último endereço distribuído dinamicamente.</small>
        </div>

        <!-- 5. Routers (Gateways) -->
        <div class="form-group">
          <label for="dhcp-routers">Gateway Padrão (Routers)</label>
          <input
            id="dhcp-routers"
            v-model="form.routers"
            type="text"
            placeholder="Ex: 192.168.1.1"
            class="input-control font-mono"
            :disabled="isApplying"
          />
          <small class="help-text">Roteador padrão enviado na Opção 3 do DHCP.</small>
        </div>

        <!-- 6. Servidores DNS -->
        <div class="form-group">
          <label for="dhcp-dns">Servidores DNS</label>
          <input
            id="dhcp-dns"
            v-model="form.dns_servers"
            type="text"
            placeholder="Ex: 127.0.0.1, 8.8.8.8"
            class="input-control font-mono"
            :disabled="isApplying"
          />
          <small class="help-text">Opção 6 do DHCP. Separe por vírgulas se houver múltiplos.</small>
        </div>

        <!-- 7. Lease Time -->
        <div class="form-group full-width">
          <label for="dhcp-lease">Tempo de Concessão (segundos)</label>
          <div class="lease-input-wrapper">
            <input
              id="dhcp-lease"
              v-model.number="form.lease_time"
              type="number"
              min="60"
              class="input-control font-mono"
              :disabled="isApplying"
            />
            <span class="lease-shortcut" @click="form.lease_time = 43200">12 Horas (43200s)</span>
            <span class="lease-shortcut" @click="form.lease_time = 86400">24 Horas (86400s)</span>
            <span class="lease-shortcut" @click="form.lease_time = 604800">7 Dias (604800s)</span>
          </div>
          <small class="help-text">Padrão RFC: 86400 segundos (24 horas).</small>
        </div>
      </div>

      <!-- Botão Aplicar Configuração -->
      <div class="actions-row">
        <button
          type="button"
          @click="applyDhcpWebSocket"
          :disabled="isApplying || !form.subnet || !form.pool_start || !form.pool_end"
          class="btn-primary"
        >
          <span v-if="isApplying">Aplicando e Reiniciando Kea via WebSocket...</span>
          <span v-else>Aplicar Configuração Kea DHCP</span>
        </button>
      </div>
    </div>

    <!-- Terminal xterm.js com Logs ao Vivo -->
    <div v-show="showTerminal" class="dhcp-card terminal-card">
      <div class="terminal-header">
        <span class="terminal-title">Terminal Kea DHCP — Streaming WebSocket (/ws/dhcp/apply)</span>
        <button @click="showTerminal = false" class="btn-terminal-toggle">Minimizar</button>
      </div>
      <div ref="terminalContainer" class="terminal-body"></div>
    </div>

    <!-- Tabela de Concessões Ativas (Leases em Tempo Real) -->
    <div class="dhcp-card">
      <div class="header-row">
        <div>
          <h3 class="title">Concessões Ativas de IP (/var/lib/kea/kea-leases4.csv)</h3>
          <p class="subtitle">Dispositivos que solicitaram e receberam IP dinâmico na rede local.</p>
        </div>
        <button @click="fetchLeases" class="btn-refresh" :disabled="loadingLeases">
          <span>{{ loadingLeases ? 'Atualizando...' : 'Recarregar Leases' }}</span>
        </button>
      </div>

      <div class="table-container">
        <table class="leases-table">
          <thead>
            <tr>
              <th>Endereço IP</th>
              <th>Endereço MAC</th>
              <th>Hostname</th>
              <th>Expiração</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="leases.length === 0">
              <td colspan="5" class="empty-row">Nenhuma concessão ativa encontrada no momento.</td>
            </tr>
            <tr v-for="lease in leases" :key="lease.ip_address" class="lease-row">
              <td class="font-mono text-ip">{{ lease.ip_address }}</td>
              <td class="font-mono">{{ lease.mac_address }}</td>
              <td>{{ lease.hostname || 'n/a' }}</td>
              <td class="font-mono text-muted">{{ lease.expire_time || 'n/a' }}</td>
              <td>
                <span class="badge-active">Ativo</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface LeaseItem {
  ip_address: string;
  mac_address: string;
  hostname: string;
  expire_time: string;
  client_id?: string;
  state?: string;
}

interface ServiceStatus {
  active: boolean;
  status_text: string;
  installed: boolean;
  config_path: string;
  config_exists: boolean;
}

const form = ref({
  interface: 'eth0',
  subnet: '192.168.1.0/24',
  pool_start: '192.168.1.100',
  pool_end: '192.168.1.200',
  routers: '192.168.1.1',
  dns_servers: '127.0.0.1, 8.8.8.8',
  lease_time: 86400,
});

const serviceStatus = ref<ServiceStatus | null>(null);
const leases = ref<LeaseItem[]>([]);
const detectedInterfaces = ref<Array<{ name: string; is_up: boolean }>>([]);
const loadingLeases = ref<boolean>(false);
const isApplying = ref<boolean>(false);
const feedback = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const showTerminal = ref<boolean>(false);

const terminalContainer = ref<HTMLDivElement | null>(null);
let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let socket: WebSocket | null = null;

const initTerminal = () => {
  if (terminalContainer.value && !term) {
    term = new Terminal({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      theme: {
        background: '#0b0f17',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        selectionBackground: '#1e293b',
      },
      convertEol: true,
    });
    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalContainer.value);
    fitAddon.fit();
  }
};

const loadStatusAndLeases = async () => {
  loadingLeases.value = true;
  try {
    const [stRes, lsRes, ifRes] = await Promise.all([
      fetch('/api/dhcp/status').then((r) => r.json()),
      fetch('/api/dhcp/leases').then((r) => r.json()),
      fetch('/api/network/interfaces').then((r) => r.json()).catch(() => []),
    ]);
    serviceStatus.value = stRes;
    leases.value = lsRes;
    if (ifRes && ifRes.length > 0) {
      detectedInterfaces.value = ifRes;
      if (!form.value.interface || form.value.interface === 'eth0') {
        const firstUp = ifRes.find((i: any) => i.is_up && i.name !== 'lo0');
        if (firstUp) form.value.interface = firstUp.name;
      }
    }
  } catch (err: any) {
    console.error('Erro ao carregar dados de DHCP:', err);
  } finally {
    loadingLeases.value = false;
  }
};

const fetchLeases = async () => {
  loadingLeases.value = true;
  try {
    const res = await fetch('/api/dhcp/leases');
    leases.value = await res.json();
  } finally {
    loadingLeases.value = false;
  }
};

const applyDhcpWebSocket = () => {
  showTerminal.value = true;
  initTerminal();

  if (socket) {
    socket.close();
  }

  isApplying.value = true;
  feedback.value = null;

  if (term) {
    term.writeln('');
    term.writeln(`\x1b[1;36m[${new Date().toLocaleTimeString()}] ▶ Conectando ao WebSocket /ws/dhcp/apply...\x1b[0m`);
  }

  const isHttps = window.location.protocol === 'https:';
  const wsProtocol = isHttps ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/ws/dhcp/apply`;

  try {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      if (term) {
        term.writeln('\x1b[1;32m✔ WebSocket conectado. Enviando parâmetros do Kea DHCPv4...\x1b[0m');
      }

      const routersList = form.value.routers
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const dnsList = form.value.dns_servers
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        interface: form.value.interface,
        subnet: form.value.subnet.trim(),
        pool_start: form.value.pool_start.trim(),
        pool_end: form.value.pool_end.trim(),
        routers: routersList,
        dns_servers: dnsList.length > 0 ? dnsList : ['127.0.0.1'],
        lease_time: Number(form.value.lease_time) || 86400,
      };

      socket?.send(JSON.stringify(payload));
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'log') {
          if (term && msg.data) term.writeln(msg.data);
        } else if (msg.type === 'started') {
          if (term) {
            term.writeln(`\x1b[1;34m[TAREFA ${msg.task_id}]\x1b[0m ${msg.message}`);
          }
        } else if (msg.type === 'status') {
          if (msg.status === 'completed' || msg.status === 'success') {
            isApplying.value = false;
            feedback.value = { type: 'success', text: 'Serviço Kea DHCPv4 configurado e reiniciado com sucesso!' };
            if (term) {
              term.writeln('\x1b[1;32m✔ [SUCESSO] kea-dhcp4-server validado e reiniciado!\x1b[0m');
            }
            loadStatusAndLeases();
          } else if (msg.status === 'failed' || msg.status === 'error') {
            isApplying.value = false;
            feedback.value = { type: 'error', text: 'Falha ao iniciar ou validar kea-dhcp4-server.' };
            if (term) {
              term.writeln(`\x1b[1;31m✖ [FALHA] Código de saída: ${msg.exit_code}\x1b[0m`);
            }
          }
        } else if (msg.type === 'error') {
          isApplying.value = false;
          feedback.value = { type: 'error', text: msg.message };
          if (term) {
            term.writeln(`\x1b[1;31m✖ [ERRO] ${msg.message}\x1b[0m`);
          }
        }
      } catch {
        if (term) term.writeln(event.data);
      }
    };

    socket.onerror = (e) => {
      console.error(e);
      isApplying.value = false;
      feedback.value = { type: 'error', text: 'Erro na conexão WebSocket com o servidor.' };
      if (term) term.writeln('\x1b[1;31m✖ Erro de conexão WebSocket.\x1b[0m');
    };

    socket.onclose = () => {
      isApplying.value = false;
    };
  } catch (err: any) {
    isApplying.value = false;
    feedback.value = { type: 'error', text: err.message };
  }
};

onMounted(() => {
  loadStatusAndLeases();
});

onUnmounted(() => {
  if (socket) socket.close();
});
</script>

<style scoped>
.dhcp-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  font-family: system-ui, -apple-system, sans-serif;
}
.dhcp-card {
  background-color: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 0.75rem;
  padding: 1.5rem;
  color: #f8fafc;
}
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #1e293b;
  padding-bottom: 1rem;
  margin-bottom: 1.5rem;
}
.title {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
}
.subtitle {
  font-size: 0.875rem;
  color: #94a3b8;
  margin: 0.25rem 0 0 0;
}
.status-badge-container {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.service-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.35rem 0.7rem;
  border-radius: 9999px;
}
.badge-active {
  background-color: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.3);
}
.badge-inactive {
  background-color: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: currentColor;
}
.btn-refresh {
  padding: 0.4rem 0.8rem;
  background-color: #1e293b;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 0.5rem;
  cursor: pointer;
  font-size: 0.8rem;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.25rem;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.full-width {
  grid-column: 1 / -1;
}
.input-control {
  background-color: #020617;
  border: 1px solid #334155;
  color: #ffffff;
  padding: 0.6rem 0.8rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
}
.input-control:focus {
  border-color: #38bdf8;
  outline: none;
}
.font-mono {
  font-family: ui-monospace, Menlo, Monaco, monospace;
}
.help-text {
  font-size: 0.75rem;
  color: #64748b;
}
.req {
  color: #f87171;
}
.lease-input-wrapper {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.lease-shortcut {
  font-size: 0.75rem;
  background-color: #1e293b;
  border: 1px solid #334155;
  padding: 0.3rem 0.6rem;
  border-radius: 0.4rem;
  cursor: pointer;
  color: #94a3b8;
}
.lease-shortcut:hover {
  color: #ffffff;
  border-color: #64748b;
}
.actions-row {
  margin-top: 1.5rem;
}
.btn-primary {
  width: 100%;
  padding: 0.85rem 1.5rem;
  background-color: #0284c7;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
}
.btn-primary:hover:not(:disabled) {
  background-color: #0369a1;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.terminal-card {
  padding: 0;
  overflow: hidden;
}
.terminal-header {
  background-color: #020617;
  padding: 0.6rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #1e293b;
}
.terminal-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: #94a3b8;
}
.btn-terminal-toggle {
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
}
.terminal-body {
  height: 250px;
  background-color: #0b0f17;
  padding: 0.75rem;
}
.table-container {
  overflow-x: auto;
}
.leases-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  text-align: left;
}
.leases-table th {
  padding: 0.6rem 0.8rem;
  background-color: #1e293b;
  color: #94a3b8;
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
}
.leases-table td {
  padding: 0.75rem 0.8rem;
  border-bottom: 1px solid #1e293b;
}
.lease-row:hover {
  background-color: rgba(30, 41, 59, 0.4);
}
.text-ip {
  color: #38bdf8;
  font-weight: 600;
}
.text-muted {
  color: #64748b;
}
.empty-row {
  text-align: center;
  color: #64748b;
  padding: 2rem !important;
}
.alert-success {
  background-color: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #4ade80;
  padding: 0.75rem;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
  font-size: 0.85rem;
}
.alert-error {
  background-color: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
  padding: 0.75rem;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
  font-size: 0.85rem;
}
</style>
