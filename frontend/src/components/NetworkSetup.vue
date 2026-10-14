<template>
  <div class="network-setup-container">
    <!-- Card Principal -->
    <div class="setup-card">
      <div class="card-header">
        <div class="header-info">
          <h2>Assistente de Configuração de Rede</h2>
          <p>Configuração de IP estático, gateway e DNS via Netplan com streaming em tempo real.</p>
        </div>
        <button 
          @click="fetchInterfaces" 
          :disabled="loadingInterfaces || isApplying"
          class="btn-refresh"
        >
          <span>{{ loadingInterfaces ? 'Carregando...' : 'Atualizar Placas' }}</span>
        </button>
      </div>

      <!-- Erro ao carregar -->
      <div v-if="fetchError" class="alert-error">
        {{ fetchError }}
      </div>

      <!-- Formulário de Rede -->
      <div class="form-grid">
        <!-- 1. Interface (select) -->
        <div class="form-group">
          <label for="iface-select">
            1. Interface de Rede
            <span v-if="selectedInterfaceInfo" class="iface-badge" :class="{ 'is-up': selectedInterfaceInfo.is_up }">
              {{ selectedInterfaceInfo.is_up ? 'ONLINE' : 'DOWN' }}
              <template v-if="selectedInterfaceInfo.mac"> • {{ selectedInterfaceInfo.mac }}</template>
            </span>
          </label>
          <select 
            id="iface-select"
            v-model="selectedInterface" 
            :disabled="loadingInterfaces || isApplying"
            class="input-control"
          >
            <option v-if="loadingInterfaces" value="">Detectando placas de rede...</option>
            <option v-else-if="interfaces.length === 0" value="">Nenhuma interface encontrada</option>
            <option 
              v-for="iface in interfaces" 
              :key="iface.name" 
              :value="iface.name"
            >
              {{ iface.name }} — {{ iface.is_up ? 'Ativa' : 'Inativa' }}
              {{ iface.ipv4 && iface.ipv4.length > 0 ? `(${iface.ipv4[0].address})` : '(Sem IP)' }}
            </option>
          </select>
          <small class="help-text">Placas de rede detectadas pelo sistema.</small>
        </div>

        <!-- 2. Endereço IP com máscara (input, ex: 192.168.1.10/24) -->
        <div class="form-group">
          <label for="ip-address">
            2. Endereço IP com Máscara CIDR <span class="required">*</span>
          </label>
          <input
            id="ip-address"
            v-model="address"
            type="text"
            placeholder="Ex: 192.168.1.10/24"
            :disabled="isApplying"
            class="input-control font-mono"
          />
          <small class="help-text">Obrigatório incluir a máscara de rede (ex: 192.168.1.10/24).</small>
        </div>

        <!-- 3. Gateway padrão (input opcional, ex: 192.168.1.1) -->
        <div class="form-group">
          <label for="gateway">
            3. Gateway Padrão <span class="optional">(Opcional)</span>
          </label>
          <input
            id="gateway"
            v-model="gateway"
            type="text"
            placeholder="Ex: 192.168.1.1"
            :disabled="isApplying"
            class="input-control font-mono"
          />
          <small class="help-text">IP do roteador de saída para internet ou sub-redes.</small>
        </div>

        <!-- 4. Servidores DNS (tags/lista de inputs, default: 127.0.0.1) -->
        <div class="form-group">
          <div class="dns-header">
            <label>4. Servidores DNS</label>
            <div class="dns-shortcuts">
              <button 
                type="button" 
                @click="addPresetDns('127.0.0.1')" 
                class="shortcut-btn"
              >
                + 127.0.0.1 (Samba)
              </button>
              <button 
                type="button" 
                @click="addPresetDns('8.8.8.8')" 
                class="shortcut-btn"
              >
                + 8.8.8.8
              </button>
            </div>
          </div>

          <!-- Container de Tags -->
          <div class="tags-container">
            <span 
              v-for="(dns, index) in dnsList" 
              :key="index"
              class="dns-tag"
            >
              {{ dns }}
              <button 
                type="button" 
                @click="removeDns(index)" 
                :disabled="isApplying" 
                class="btn-remove-tag"
                title="Remover DNS"
              >
                &times;
              </button>
            </span>

            <div class="tag-input-wrapper">
              <input
                v-model="newDnsInput"
                type="text"
                placeholder="Novo IP (Enter)..."
                @keydown.enter.prevent="addDns"
                @keydown.,.prevent="addDns"
                :disabled="isApplying"
                class="tag-inline-input"
              />
              <button 
                type="button" 
                @click="addDns" 
                :disabled="isApplying || !newDnsInput.trim()"
                class="btn-add-tag"
              >
                Adicionar
              </button>
            </div>
          </div>

          <div v-if="dnsError" class="dns-error">
            {{ dnsError }}
          </div>
          <small class="help-text">Padrão: 127.0.0.1 (necessário para resolução interna do Samba AD DC).</small>
        </div>
      </div>

      <!-- Botão Aplicar Configuração -->
      <div class="actions-row">
        <button
          type="button"
          @click="applyConfiguration"
          :disabled="isApplying || !selectedInterface || !address"
          class="btn-apply"
        >
          <span v-if="isApplying">Aplicando Configuração via WebSocket...</span>
          <span v-else>Aplicar Configuração</span>
        </button>
      </div>
    </div>

    <!-- Terminal xterm.js -->
    <div class="terminal-card">
      <div class="terminal-header">
        <div class="terminal-title">
          <span>Terminal xterm.js — Canal WebSocket (/api/network/ws/apply)</span>
          <span v-if="taskId" class="task-id-badge">ID: {{ taskId }}</span>
        </div>
        <div class="terminal-controls">
          <span v-if="executionState === 'running'" class="status-indicator running">Executando</span>
          <span v-else-if="executionState === 'success'" class="status-indicator success">Concluído</span>
          <span v-else-if="executionState === 'error'" class="status-indicator error">Erro</span>
          <button @click="clearTerminal" class="btn-terminal-clear">Limpar</button>
        </div>
      </div>

      <div v-if="logFile" class="log-file-notice">
        Arquivo de auditoria: {{ logFile }}
      </div>

      <div ref="terminalContainer" class="xterm-container"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface NetworkInterface {
  name: string;
  is_up: boolean;
  speed_mbps: number;
  mtu: number;
  mac: string | null;
  ipv4: Array<{
    address: string;
    netmask: string;
    broadcast: string | null;
  }>;
}

// 1. Estado de Interfaces
const interfaces = ref<NetworkInterface[]>([]);
const loadingInterfaces = ref<boolean>(true);
const fetchError = ref<string | null>(null);

// 2. Formulário
const selectedInterface = ref<string>('');
const address = ref<string>('192.168.1.10/24');
const gateway = ref<string>('192.168.1.1');
const dnsList = ref<string[]>(['127.0.0.1']);
const newDnsInput = ref<string>('');
const dnsError = ref<string | null>(null);

// 3. Execução e WebSocket
const isApplying = ref<boolean>(false);
const executionState = ref<'idle' | 'connecting' | 'running' | 'success' | 'error'>('idle');
const taskId = ref<string | null>(null);
const logFile = ref<string | null>(null);

// Referências ao xterm
const terminalContainer = ref<HTMLDivElement | null>(null);
let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let socket: WebSocket | null = null;

const selectedInterfaceInfo = computed(() => {
  return interfaces.value.find((i) => i.name === selectedInterface.value);
});

// 1. Ao carregar, faz GET em '/api/network/interfaces' e preenche um dropdown
const fetchInterfaces = async () => {
  loadingInterfaces.value = true;
  fetchError.value = null;
  try {
    const res = await fetch('/api/network/interfaces');
    if (!res.ok) throw new Error(`HTTP ${res.status}: Falha ao buscar interfaces`);
    const data: NetworkInterface[] = await res.json();
    interfaces.value = data;

    if (data.length > 0) {
      const active = data.find((i) => i.is_up && i.name !== 'lo') || data[0];
      selectedInterface.value = active.name;
    }
  } catch (err: any) {
    fetchError.value = err.message || 'Erro ao carregar placas de rede.';
  } finally {
    loadingInterfaces.value = false;
  }
};

// Manipulação de DNS tags
const addDns = () => {
  dnsError.value = null;
  const val = newDnsInput.value.trim();
  if (!val) return;

  const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (!ipv4Pattern.test(val)) {
    dnsError.value = 'Endereço IPv4 inválido.';
    return;
  }

  if (dnsList.value.includes(val)) {
    dnsError.value = 'Este servidor DNS já está na lista.';
    return;
  }

  dnsList.value.push(val);
  newDnsInput.value = '';
};

const removeDns = (index: number) => {
  dnsList.value.splice(index, 1);
};

const addPresetDns = (presetIp: string) => {
  if (!dnsList.value.includes(presetIp)) {
    dnsList.value.push(presetIp);
  }
};

// 3. Botão 'Aplicar Configuração' que conecta ao WebSocket '/api/network/ws/apply'
const applyConfiguration = () => {
  if (!selectedInterface.value) {
    alert('Selecione uma interface de rede.');
    return;
  }

  if (!address.value.trim() || !address.value.includes('/')) {
    alert('Endereço IP com máscara CIDR é obrigatório (ex: 192.168.1.10/24).');
    return;
  }

  if (socket) {
    socket.close();
  }

  isApplying.value = true;
  executionState.value = 'connecting';
  taskId.value = null;
  logFile.value = null;

  if (term) {
    term.writeln('');
    term.writeln(`\x1b[1;33m[${new Date().toLocaleTimeString()}] ▶ Conectando ao WebSocket /api/network/ws/apply...\x1b[0m`);
    term.writeln(`\x1b[90mInterface:\x1b[0m ${selectedInterface.value} | \x1b[90mIP:\x1b[0m ${address.value} | \x1b[90mGateway:\x1b[0m ${gateway.value || '(Nenhum)'}`);
    term.writeln(`\x1b[90mDNS:\x1b[0m ${dnsList.value.join(', ')}`);
    term.writeln('\x1b[90m────────────────────────────────────────────────────────────────\x1b[0m');
  }

  const isHttps = window.location.protocol === 'https:';
  const wsProtocol = isHttps ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/api/network/ws/apply`;

  try {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      executionState.value = 'running';
      if (term) {
        term.writeln('\x1b[1;32m✔ Conectado ao servidor. Enviando configuração Netplan...\x1b[0m');
      }

      const payload = {
        interface: selectedInterface.value,
        address: address.value.trim(),
        gateway: gateway.value.trim() || null,
        nameservers: dnsList.value.length > 0 ? dnsList.value : ['127.0.0.1'],
      };
      socket?.send(JSON.stringify(payload));
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'started') {
          taskId.value = msg.task_id;
          logFile.value = msg.log_file;
          if (term) {
            term.writeln(`\x1b[1;34m[TAREFA ${msg.task_id}]\x1b[0m ${msg.message}`);
          }
        } else if (msg.type === 'log') {
          if (term && msg.data) {
            term.writeln(msg.data);
          }
        } else if (msg.type === 'status') {
          if (msg.task_id) taskId.value = msg.task_id;
          if (msg.log_file) logFile.value = msg.log_file;
          if (msg.status === 'completed' || msg.status === 'success') {
            executionState.value = 'success';
            isApplying.value = false;
            if (term) {
              term.writeln('\x1b[1;32m✔ [SUCESSO] Configuração Netplan aplicada com êxito!\x1b[0m');
            }
          } else if (msg.status === 'failed' || msg.status === 'error') {
            executionState.value = 'error';
            isApplying.value = false;
            if (term) {
              term.writeln(`\x1b[1;31m✖ [FALHA] Código de saída: ${msg.exit_code}\x1b[0m`);
            }
          }
        } else if (msg.type === 'error') {
          executionState.value = 'error';
          isApplying.value = false;
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
      executionState.value = 'error';
      isApplying.value = false;
      if (term) term.writeln('\x1b[1;31m✖ Erro na conexão WebSocket.\x1b[0m');
    };

    socket.onclose = () => {
      isApplying.value = false;
      if (term) {
        term.writeln(`\x1b[90m[${new Date().toLocaleTimeString()}] WebSocket finalizado.\x1b[0m`);
      }
    };
  } catch (err: any) {
    executionState.value = 'error';
    isApplying.value = false;
    if (term) {
      term.writeln(`\x1b[1;31m✖ Falha ao criar conexão WebSocket: ${err.message}\x1b[0m`);
    }
  }
};

const clearTerminal = () => {
  if (term) {
    term.clear();
    term.writeln('\x1b[90mTerminal limpo.\x1b[0m\r\n');
  }
};

// Lifecycle
onMounted(() => {
  fetchInterfaces();

  if (terminalContainer.value) {
    term = new Terminal({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      theme: {
        background: '#0b0f17',
        foreground: '#e2e8f0',
        cursor: '#22c55e',
        selectionBackground: '#1e293b',
      },
      convertEol: true,
    });

    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalContainer.value);
    fitAddon.fit();

    term.writeln('\x1b[1;36mNetworkSetup.vue — Terminal xterm.js Pronto\x1b[0m');
    term.writeln('\x1b[90mAguardando aplicação...\x1b[0m\r\n');

    window.addEventListener('resize', () => fitAddon?.fit());
  }
});

onUnmounted(() => {
  if (socket) {
    socket.close();
  }
});
</script>

<style scoped>
.network-setup-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  font-family: system-ui, -apple-system, sans-serif;
}

.setup-card, .terminal-card {
  background-color: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 0.75rem;
  padding: 1.5rem;
  color: #f8fafc;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #1e293b;
  padding-bottom: 1rem;
  margin-bottom: 1.5rem;
}

.card-header h2 {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
}

.card-header p {
  font-size: 0.875rem;
  color: #94a3b8;
  margin: 0.25rem 0 0 0;
}

.btn-refresh {
  padding: 0.4rem 0.8rem;
  background-color: #1e293b;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 0.5rem;
  cursor: pointer;
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

.form-group label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #cbd5e1;
  display: flex;
  justify-content: space-between;
  align-items: center;
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
  border-color: #3b82f6;
  outline: none;
}

.font-mono {
  font-family: ui-monospace, Menlo, Monaco, monospace;
}

.help-text {
  font-size: 0.75rem;
  color: #64748b;
}

.tags-container {
  background-color: #020617;
  border: 1px solid #334155;
  border-radius: 0.5rem;
  padding: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  min-height: 50px;
}

.dns-tag {
  background-color: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.3);
  padding: 0.2rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-family: monospace;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.btn-remove-tag {
  background: none;
  border: none;
  color: #93c5fd;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-remove-tag:hover {
  color: #ef4444;
}

.tag-inline-input {
  background: transparent;
  border: none;
  color: white;
  font-size: 0.8rem;
  outline: none;
  flex: 1;
  min-width: 120px;
}

.btn-add-tag {
  padding: 0.2rem 0.5rem;
  background-color: #1e293b;
  border: 1px solid #475569;
  color: #cbd5e1;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  cursor: pointer;
}

.dns-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dns-shortcuts {
  display: flex;
  gap: 0.4rem;
}

.shortcut-btn {
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  background-color: #1e293b;
  color: #94a3b8;
  border: 1px solid #334155;
  border-radius: 0.25rem;
  cursor: pointer;
}

.actions-row {
  margin-top: 1.5rem;
}

.btn-apply {
  width: 100%;
  padding: 0.75rem 1.5rem;
  background-color: #2563eb;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-apply:hover:not(:disabled) {
  background-color: #1d4ed8;
}

.btn-apply:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.terminal-card {
  padding: 0;
  overflow: hidden;
}

.terminal-header {
  background-color: #020617;
  padding: 0.75rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #1e293b;
}

.terminal-title {
  font-size: 0.875rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.task-id-badge {
  color: #38bdf8;
  font-family: monospace;
  font-size: 0.75rem;
}

.terminal-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-indicator {
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 9999px;
  font-weight: 500;
}

.status-indicator.running {
  background-color: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}

.status-indicator.success {
  background-color: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}

.status-indicator.error {
  background-color: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.btn-terminal-clear {
  background: #1e293b;
  border: 1px solid #334155;
  color: #94a3b8;
  padding: 0.2rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  cursor: pointer;
}

.log-file-notice {
  background-color: rgba(15, 23, 42, 0.8);
  padding: 0.4rem 1rem;
  font-size: 0.75rem;
  font-family: monospace;
  color: #94a3b8;
  border-bottom: 1px solid #1e293b;
}

.xterm-container {
  padding: 0.75rem;
  height: 280px;
  background-color: #0b0f17;
}

.alert-error {
  background-color: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
  padding: 0.75rem;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}
</style>
