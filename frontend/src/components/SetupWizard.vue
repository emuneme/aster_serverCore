<template>
  <div class="wizard-container">
    <!-- Header e Stepper -->
    <div class="wizard-card header-card">
      <div class="header-content">
        <div class="header-icon-wrap">
          <svg class="icon icon-lg text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z" />
            <path d="m5 2 5 5" />
            <path d="m2 5 5 5" />
            <path d="M22 22h-6" />
          </svg>
        </div>
        <div>
          <h1 class="title">Assistente de Configuração Unificada (Setup Wizard)</h1>
          <p class="subtitle">
            Provisionamento contínuo em sequência: Rede → Samba 4 AD DC → Kea DHCP → Firewall UFW
          </p>
        </div>
      </div>

      <!-- Abas do Stepper -->
      <div class="stepper-grid">
        <button
          v-for="s in [
            { id: 1, title: '1. Rede & Netplan', desc: 'IP estático e interfaces' },
            { id: 2, title: '2. Domínio AD DC', desc: 'Realm e credenciais' },
            { id: 3, title: '3. DHCP & Firewall', desc: 'Faixas e segurança' },
            { id: 4, title: '4. Resumo & Execução', desc: 'Execução contínua' }
          ]"
          :key="s.id"
          type="button"
          :disabled="isExecuting"
          @click="currentStep = s.id"
          class="step-tab-btn"
          :class="{
            active: currentStep === s.id,
            completed: currentStep > s.id
          }"
        >
          <div class="step-num-badge">
            <span v-if="currentStep > s.id">✔</span>
            <span v-else>{{ s.id }}</span>
          </div>
          <div class="step-tab-text">
            <span class="step-tab-title">{{ s.title }}</span>
            <span class="step-tab-sub">{{ s.desc }}</span>
          </div>
        </button>
      </div>
    </div>

    <!-- Feedback / Alerta de Passo -->
    <div v-if="stepError" class="alert-box alert-error">
      <span>{{ stepError }}</span>
      <button @click="stepError = null" class="btn-close">&times;</button>
    </div>

    <!-- PASSO 1: Rede -->
    <div v-if="currentStep === 1" class="wizard-card">
      <div class="card-title-row">
        <h3>Passo 1: Identidade de Rede e Conectividade IP</h3>
        <p>Defina o endereço IP fixo do servidor e libere a porta 53 no systemd-resolved.</p>
      </div>

      <div class="form-grid">
        <div class="form-group">
          <label>Placa de Rede *</label>
          <select v-model="form.network_interface" class="input-control font-mono">
            <option value="">Selecione uma interface...</option>
            <option v-for="iface in interfaces" :key="iface.name" :value="iface.name">
              {{ iface.name }} ({{ iface.is_up ? 'ONLINE' : 'DOWN' }})
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>Endereço IP com CIDR *</label>
          <input
            v-model="form.server_ip_cidr"
            type="text"
            placeholder="Ex: 192.168.1.10/24"
            class="input-control font-mono"
            @input="onIpCidrChange"
          />
        </div>

        <div class="form-group">
          <label>Gateway Padrão IPv4</label>
          <input
            v-model="form.gateway"
            type="text"
            placeholder="Ex: 192.168.1.1"
            class="input-control font-mono"
          />
        </div>

        <div class="form-group">
          <label>DNS Upstream / Forwarders</label>
          <input
            v-model="upstreamDnsInput"
            type="text"
            placeholder="Ex: 8.8.8.8, 1.1.1.1"
            class="input-control font-mono"
          />
        </div>
      </div>

      <div class="card-footer-actions right">
        <button type="button" @click="goToStep(2)" class="btn-primary">
          Avançar para Domínio AD &rarr;
        </button>
      </div>
    </div>

    <!-- PASSO 2: Domínio AD DC -->
    <div v-if="currentStep === 2" class="wizard-card">
      <div class="card-title-row">
        <h3>Passo 2: Samba 4 Active Directory Domain Controller</h3>
        <p>Defina a estrutura de domínio do Active Directory, Realm Kerberos e senha do Administrador.</p>
      </div>

      <div class="form-grid">
        <div class="form-group">
          <label>Realm Kerberos (FQDN) *</label>
          <input
            v-model="form.realm"
            type="text"
            placeholder="Ex: EMPRESA.LOCAL"
            class="input-control font-mono uppercase"
            @input="onRealmChange"
          />
        </div>

        <div class="form-group">
          <label>Domínio NetBIOS *</label>
          <input
            v-model="form.domain"
            type="text"
            placeholder="Ex: EMPRESA"
            maxlength="15"
            class="input-control font-mono uppercase"
          />
        </div>

        <div class="form-group full-width">
          <label>Senha do Administrador do AD *</label>
          <input
            v-model="form.admin_password"
            type="password"
            placeholder="Mínimo 8 caracteres com maiúsculas, números e símbolos"
            class="input-control font-mono"
          />
        </div>
      </div>

      <div class="card-footer-actions between">
        <button type="button" @click="currentStep = 1" class="btn-secondary">
          &larr; Voltar para Rede
        </button>
        <button type="button" @click="goToStep(3)" class="btn-primary">
          Avançar para DHCP & Firewall &rarr;
        </button>
      </div>
    </div>

    <!-- PASSO 3: DHCP & Firewall -->
    <div v-if="currentStep === 3" class="wizard-card">
      <div class="card-title-row">
        <h3>Passo 3: Servidor DHCP & Firewall UFW</h3>
        <p>Distribua IPs para as estações de trabalho e proteja o perímetro do servidor.</p>
      </div>

      <div class="sub-card">
        <div class="flex-between">
          <div>
            <strong>Ativar Servidor Kea DHCPv4</strong>
            <p class="help-text">Distribuição automática de IPs com DNS primário apontando para este servidor.</p>
          </div>
          <input type="checkbox" v-model="form.enable_dhcp" class="checkbox-input" />
        </div>

        <div v-if="form.enable_dhcp" class="form-grid mt-3 pt-3 border-top">
          <div class="form-group">
            <label>Início do Pool DHCP *</label>
            <input v-model="form.dhcp_pool_start" type="text" class="input-control font-mono" />
          </div>
          <div class="form-group">
            <label>Fim do Pool DHCP *</label>
            <input v-model="form.dhcp_pool_end" type="text" class="input-control font-mono" />
          </div>
        </div>
      </div>

      <div class="sub-card flex-between">
        <div>
          <strong>Ativar Firewall UFW com Salvaguarda SSH</strong>
          <p class="help-text">Abre portas do AD, DHCP, DNS e garante o acesso remoto pela porta 22 (SSH).</p>
        </div>
        <input type="checkbox" v-model="form.enable_firewall" class="checkbox-input" />
      </div>

      <div class="card-footer-actions between">
        <button type="button" @click="currentStep = 2" class="btn-secondary">
          &larr; Voltar para Domínio
        </button>
        <button type="button" @click="goToStep(4)" class="btn-primary">
          Avançar para Resumo & Execução &rarr;
        </button>
      </div>
    </div>

    <!-- PASSO 4: Resumo & Execução -->
    <div v-if="currentStep === 4" class="wizard-card">
      <div class="card-title-row">
        <h3>Passo 4: Resumo e Execução Contínua do Provisionamento</h3>
        <p>Revise os parâmetros e acompanhe o streaming em tempo real das 4 etapas.</p>
      </div>

      <!-- Resumo Grid -->
      <div class="summary-grid">
        <div class="summary-box">
          <span class="summary-label">1. Rede</span>
          <span class="summary-val">{{ form.server_ip_cidr }} ({{ form.network_interface }})</span>
        </div>
        <div class="summary-box">
          <span class="summary-label">2. Samba AD DC</span>
          <span class="summary-val">{{ form.realm }} ({{ form.domain }})</span>
        </div>
        <div class="summary-box">
          <span class="summary-label">3. Kea DHCP</span>
          <span class="summary-val">{{ form.enable_dhcp ? `${form.dhcp_pool_start} → ${form.dhcp_pool_end}` : 'Desativado' }}</span>
        </div>
        <div class="summary-box">
          <span class="summary-label">4. Firewall UFW</span>
          <span class="summary-val">{{ form.enable_firewall ? 'Ativo (SSH Garantido)' : 'Desativado' }}</span>
        </div>
      </div>

      <!-- Barra de Progresso -->
      <div class="progress-wrap">
        <div class="progress-info">
          <span>{{ executionStepName }}</span>
          <strong>{{ executionProgress }}%</strong>
        </div>
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${executionProgress}%` }"></div>
        </div>
      </div>

      <!-- Ações de Início -->
      <div v-if="!isCompleted" class="card-footer-actions between">
        <button type="button" @click="currentStep = 3" :disabled="isExecuting" class="btn-secondary">
          &larr; Voltar
        </button>
        <button
          type="button"
          @click="startExecution"
          :disabled="isExecuting"
          class="btn-start"
        >
          {{ isExecuting ? 'Executando Orquestração...' : 'Iniciar Provisionamento Completo' }}
        </button>
      </div>

      <!-- Console / Terminal de Saída -->
      <div class="console-box">
        <div class="console-header">Console de Execução em Tempo Real (WebSocket /ws/wizard/execute)</div>
        <div class="console-content" ref="consoleOutputRef">
          <div v-for="(log, idx) in logs" :key="idx" class="console-line">{{ log }}</div>
        </div>
      </div>

      <!-- Sucesso Final -->
      <div v-if="isCompleted" class="success-banner">
        <h4>✔ Servidor Provisionado com Sucesso!</h4>
        <p>Todos os serviços de infraestrutura foram configurados e iniciados.</p>
        <button @click="$emit('navigate', 'dashboard')" class="btn-primary mt-3">
          Ir para o Dashboard Principal
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const emit = defineEmits<{
  (e: 'navigate', tab: string): void;
}>();

const currentStep = ref<number>(1);
const stepError = ref<string | null>(null);
const isExecuting = ref(false);
const executionProgress = ref(0);
const executionStepName = ref('Aguardando início...');
const isCompleted = ref(false);
const logs = ref<string[]>([]);
const interfaces = ref<any[]>([]);

const upstreamDnsInput = ref('8.8.8.8, 1.1.1.1');

const form = ref({
  network_interface: '',
  server_ip_cidr: '192.168.1.10/24',
  gateway: '192.168.1.1',
  realm: 'EMPRESA.LOCAL',
  domain: 'EMPRESA',
  admin_password: 'AdminPassword2026!',
  enable_dhcp: true,
  dhcp_pool_start: '192.168.1.100',
  dhcp_pool_end: '192.168.1.200',
  lease_time: 86400,
  enable_firewall: true,
  allow_ssh: true
});

const onIpCidrChange = () => {
  const parts = form.value.server_ip_cidr.split('/')[0].split('.');
  if (parts.length === 4) {
    const base = `${parts[0]}.${parts[1]}.${parts[2]}`;
    form.value.dhcp_pool_start = `${base}.100`;
    form.value.dhcp_pool_end = `${base}.200`;
  }
};

const onRealmChange = () => {
  form.value.realm = form.value.realm.toUpperCase();
  const first = form.value.realm.split('.')[0];
  if (first) {
    form.value.domain = first.substring(0, 15).toUpperCase();
  }
};

const goToStep = (step: number) => {
  stepError.value = null;
  if (step === 2 && (!form.value.network_interface || !form.value.server_ip_cidr.includes('/'))) {
    stepError.value = 'Preencha a placa de rede e o IP CIDR corretamente.';
    return;
  }
  if (step === 3 && (!form.value.realm.includes('.') || form.value.admin_password.length < 8)) {
    stepError.value = 'Preencha o Realm e uma senha de no mínimo 8 caracteres.';
    return;
  }
  currentStep.value = step;
};

const loadInterfaces = async () => {
  try {
    const res = await fetch('/api/network/interfaces');
    if (res.ok) {
      const data = await res.json();
      interfaces.value = data;
      if (data.length > 0 && !form.value.network_interface) {
        form.value.network_interface = data[0].name;
      }
    }
  } catch (e) {
    console.error(e);
  }
};

const startExecution = () => {
  if (isExecuting.value) return;
  isExecuting.value = true;
  executionProgress.value = 0;
  logs.value = ['[Iniciando conexão WebSocket com /ws/wizard/execute...]'];

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${window.location.host}/ws/wizard/execute`);

  ws.onopen = () => {
    logs.value.push('[Conectado. Enviando configuração do servidor...]');
    const payload = {
      ...form.value,
      upstream_dns: upstreamDnsInput.value.split(',').map((s) => s.trim()).filter(Boolean)
    };
    ws.send(JSON.stringify(payload));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'log') {
        logs.value.push(msg.data);
      } else if (msg.type === 'progress') {
        executionProgress.value = msg.percent;
        executionStepName.value = msg.step_name;
      } else if (msg.type === 'completed') {
        executionProgress.value = 100;
        isExecuting.value = false;
        isCompleted.value = true;
        executionStepName.value = 'Provisionamento Concluído!';
      } else if (msg.type === 'error') {
        isExecuting.value = false;
        stepError.value = msg.message;
      }
    } catch (e) {
      console.error(e);
    }
  };

  ws.onerror = () => {
    isExecuting.value = false;
    stepError.value = 'Falha na conexão com o WebSocket.';
  };
};

onMounted(() => {
  loadInterfaces();
});
</script>

<style scoped>
.wizard-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 1100px;
  margin: 0 auto;
}
.wizard-card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 1rem;
  padding: 1.5rem;
}
.header-content {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.header-icon-wrap {
  padding: 0.75rem;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border-radius: 0.75rem;
}
.icon-lg {
  width: 1.5rem;
  height: 1.5rem;
}
.title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #fff;
  margin: 0;
}
.subtitle {
  font-size: 0.75rem;
  color: #94a3b8;
  margin: 0.25rem 0 0;
}
.stepper-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.5rem;
  margin-top: 1.25rem;
  padding-top: 1.25rem;
  border-top: 1px solid #1e293b;
}
.step-tab-btn {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: rgba(2, 6, 23, 0.4);
  border: 1px solid #1e293b;
  border-radius: 0.75rem;
  cursor: pointer;
  text-align: left;
}
.step-tab-btn.active {
  background: rgba(49, 46, 129, 0.4);
  border-color: #6366f1;
}
.step-num-badge {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.5rem;
  background: #1e293b;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
}
.step-tab-btn.active .step-num-badge {
  background: #6366f1;
  color: #fff;
}
.step-tab-btn.completed .step-num-badge {
  background: #047857;
  color: #6ee7b7;
}
.step-tab-title {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: #fff;
}
.step-tab-sub {
  display: block;
  font-size: 0.625rem;
  color: #94a3b8;
}
.card-title-row h3 {
  margin: 0;
  font-size: 1rem;
  color: #fff;
}
.card-title-row p {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: #94a3b8;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
  margin-top: 1.25rem;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.form-group label {
  font-size: 0.75rem;
  color: #cbd5e1;
}
.input-control {
  background: #020617;
  border: 1px solid #334155;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  color: #fff;
  outline: none;
}
.input-control:focus {
  border-color: #6366f1;
}
.full-width {
  grid-column: 1 / -1;
}
.font-mono {
  font-family: monospace;
}
.uppercase {
  text-transform: uppercase;
}
.card-footer-actions {
  display: flex;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #1e293b;
}
.card-footer-actions.right { justify-content: flex-end; }
.card-footer-actions.between { justify-content: space-between; }
.btn-primary {
  background: #4f46e5;
  color: #fff;
  border: none;
  padding: 0.625rem 1.25rem;
  border-radius: 0.5rem;
  font-weight: 600;
  font-size: 0.75rem;
  cursor: pointer;
}
.btn-primary:hover { background: #4338ca; }
.btn-secondary {
  background: #1e293b;
  color: #94a3b8;
  border: none;
  padding: 0.625rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  cursor: pointer;
}
.btn-start {
  background: #059669;
  color: #fff;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}
.btn-start:hover { background: #047857; }
.sub-card {
  background: rgba(2, 6, 23, 0.6);
  border: 1px solid #1e293b;
  border-radius: 0.75rem;
  padding: 1rem;
  margin-top: 1rem;
}
.flex-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.help-text {
  font-size: 0.6875rem;
  color: #94a3b8;
  margin: 0.25rem 0 0;
}
.checkbox-input {
  width: 1.125rem;
  height: 1.125rem;
  cursor: pointer;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
  margin-top: 1rem;
}
.summary-box {
  background: #020617;
  border: 1px solid #1e293b;
  border-radius: 0.5rem;
  padding: 0.75rem;
}
.summary-label {
  display: block;
  font-size: 0.6875rem;
  color: #94a3b8;
}
.summary-val {
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  color: #fff;
  margin-top: 0.25rem;
}
.progress-wrap {
  margin-top: 1.25rem;
}
.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #cbd5e1;
  margin-bottom: 0.375rem;
}
.progress-track {
  width: 100%;
  height: 0.625rem;
  background: #1e293b;
  border-radius: 9999px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #38bdf8, #10b981);
  transition: width 0.3s ease;
}
.console-box {
  margin-top: 1.25rem;
  background: #020617;
  border: 1px solid #1e293b;
  border-radius: 0.75rem;
  overflow: hidden;
}
.console-header {
  background: #0b0f17;
  padding: 0.5rem 0.75rem;
  font-size: 0.6875rem;
  color: #94a3b8;
  border-bottom: 1px solid #1e293b;
}
.console-content {
  padding: 0.75rem;
  height: 200px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 0.6875rem;
  color: #cbd5e1;
}
.console-line {
  line-height: 1.4;
}
.success-banner {
  margin-top: 1.25rem;
  padding: 1rem;
  background: rgba(6, 78, 59, 0.4);
  border: 1px solid #047857;
  border-radius: 0.75rem;
  text-align: center;
}
.success-banner h4 {
  color: #6ee7b7;
  margin: 0;
}
.success-banner p {
  color: #d1fae5;
  font-size: 0.75rem;
  margin: 0.25rem 0 0;
}
.alert-box {
  padding: 0.75rem;
  border-radius: 0.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
}
.alert-error {
  background: rgba(136, 19, 55, 0.5);
  border: 1px solid #be123c;
  color: #fda4af;
}
.btn-close {
  background: none;
  border: none;
  color: inherit;
  font-size: 1.25rem;
  cursor: pointer;
}
</style>
