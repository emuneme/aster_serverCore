<template>
  <div class="firewall-manager-container">
    <!-- Card Principal de Status e Cabeçalho -->
    <div class="fm-card header-card">
      <div class="header-row">
        <div class="header-info">
          <div class="header-icon-title">
            <div class="icon-badge">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <h2 class="title">Firewall UFW & Roteador NAT</h2>
              <p class="subtitle">
                Segurança perimetral do Ubuntu Server, perfis automáticos de serviços e gateway de internet
              </p>
            </div>
          </div>
        </div>

        <div class="header-actions">
          <span 
            class="status-badge" 
            :class="status?.active ? 'badge-active' : 'badge-inactive'"
          >
            <span class="status-dot"></span>
            {{ status?.active ? 'FIREWALL ATIVO' : 'FIREWALL DESATIVADO' }}
          </span>

          <button 
            @click="toggleUfw" 
            :disabled="togglingUfw || loading"
            class="btn-toggle"
            :class="status?.active ? 'btn-disable' : 'btn-enable'"
          >
            <span>{{ status?.active ? 'Desativar UFW' : 'Ativar UFW (Seguro)' }}</span>
          </button>

          <button 
            @click="loadAllData" 
            :disabled="loading"
            class="btn-refresh" 
            title="Recarregar status"
          >
            <svg class="icon spin-icon" :class="{ spinning: loading }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Feedback / Alerta -->
      <div v-if="feedback" :class="['alert-box', `alert-${feedback.type}`]">
        <span>{{ feedback.text }}</span>
        <button @click="feedback = null" class="btn-close-alert">&times;</button>
      </div>

      <!-- Métricas / Status Grid -->
      <div class="metrics-grid">
        <div class="metric-box">
          <span class="metric-label">Estado Geral</span>
          <span class="metric-value" :class="status?.active ? 'text-emerald' : 'text-rose'">
            {{ status?.active ? 'Ativo e Protegendo' : 'Desativado' }}
          </span>
        </div>
        <div class="metric-box">
          <span class="metric-label">Política Entrada</span>
          <span class="metric-value font-mono text-rose">
            {{ status?.default_incoming || 'DENY' }}
          </span>
        </div>
        <div class="metric-box">
          <span class="metric-label">Política Saída</span>
          <span class="metric-value font-mono text-emerald">
            {{ status?.default_outgoing || 'ALLOW' }}
          </span>
        </div>
        <div class="metric-box">
          <span class="metric-label">Gateway NAT</span>
          <span class="metric-value" :class="natStatus?.enabled ? 'text-sky' : 'text-slate'">
            {{ natStatus?.enabled ? `Ativo (${natStatus.lan_interface} → ${natStatus.wan_interface})` : 'Desativado' }}
          </span>
        </div>
      </div>
    </div>

    <!-- Seção Perfis em 1-Clique -->
    <div class="fm-card">
      <div class="section-header">
        <h3 class="section-title">
          <svg class="icon icon-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          Perfis de Serviços em 1-Clique
        </h3>
        <p class="section-desc">
          Libere automaticamente todos os protocolos necessários para cada serviço de infraestrutura
        </p>
      </div>

      <div class="quick-profiles-grid">
        <!-- 1. SSH -->
        <button 
          @click="applyProfile('ssh', 'Garantir Acesso SSH')"
          :disabled="isApplyingProfile"
          class="profile-quick-btn"
        >
          <div class="profile-icon-wrap icon-indigo">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div class="profile-text">
            <div class="profile-header-line">
              <span class="profile-name">Garantir Acesso SSH</span>
              <span class="port-tag">22/tcp</span>
            </div>
            <p class="profile-sub">Libera o terminal remoto e previne bloqueio acidental.</p>
          </div>
        </button>

        <!-- 2. Samba AD -->
        <button 
          @click="applyProfile('samba_ad', 'Samba 4 AD DC')"
          :disabled="isApplyingProfile"
          class="profile-quick-btn"
        >
          <div class="profile-icon-wrap icon-emerald">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
              <line x1="6" y1="6" x2="6.01" y2="6"/>
              <line x1="6" y1="18" x2="6.01" y2="18"/>
            </svg>
          </div>
          <div class="profile-text">
            <div class="profile-header-line">
              <span class="profile-name">Liberar Samba AD</span>
              <span class="port-tag">17 Portas</span>
            </div>
            <p class="profile-sub">Libera Kerberos, LDAP, SMB, RPC e portas de catálogo AD.</p>
          </div>
        </button>

        <!-- 3. DHCP e DNS -->
        <button 
          @click="applyMultiProfiles(['dhcp', 'dns'], 'DHCP & DNS')"
          :disabled="isApplyingProfile"
          class="profile-quick-btn"
        >
          <div class="profile-icon-wrap icon-sky">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <div class="profile-text">
            <div class="profile-header-line">
              <span class="profile-name">Liberar DHCP / DNS</span>
              <span class="port-tag">53 & 67/68</span>
            </div>
            <p class="profile-sub">Abre portas para Kea DHCPv4 e BIND9/DNS na rede local.</p>
          </div>
        </button>
      </div>
    </div>

    <!-- Seção Roteador / NAT -->
    <div class="fm-card">
      <div class="section-header">
        <h3 class="section-title">
          <svg class="icon icon-sky" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          Roteador & Compartilhamento de Internet (NAT / Masquerade)
        </h3>
        <p class="section-desc">
          Roteia o tráfego da rede local (LAN) para a Internet através da interface externa (WAN)
        </p>
      </div>

      <div class="nat-form-box">
        <div class="form-grid">
          <div class="form-group">
            <label for="nat-lan">Interface de Entrada (LAN Local) *</label>
            <select id="nat-lan" v-model="natForm.lan_interface" class="input-control font-mono">
              <option value="">Selecione interface LAN...</option>
              <option v-for="iface in interfaces" :key="`lan-${iface.name}`" :value="iface.name">
                {{ iface.name }} ({{ iface.is_up ? 'ONLINE' : 'DOWN' }})
              </option>
            </select>
            <small class="help-text">Conectada à rede interna dos clientes.</small>
          </div>

          <div class="form-group">
            <label for="nat-wan">Interface de Saída (WAN Internet) *</label>
            <select id="nat-wan" v-model="natForm.wan_interface" class="input-control font-mono">
              <option value="">Selecione interface WAN...</option>
              <option v-for="iface in interfaces" :key="`wan-${iface.name}`" :value="iface.name">
                {{ iface.name }} ({{ iface.is_up ? 'ONLINE' : 'DOWN' }})
              </option>
            </select>
            <small class="help-text">Conectada ao modem ou uplink externo.</small>
          </div>

          <div class="form-group">
            <label for="nat-subnet">Sub-rede LAN (Opcional)</label>
            <input 
              id="nat-subnet"
              v-model="natForm.lan_subnet"
              type="text" 
              placeholder="Ex: 192.168.1.0/24" 
              class="input-control font-mono"
            />
            <small class="help-text">Deixe em branco para mascarar toda a interface LAN.</small>
          </div>
        </div>

        <div class="nat-footer">
          <div class="nat-sysctl-status">
            <span class="status-dot-small" :class="{ active: natStatus?.ip_forwarding }"></span>
            <span>Kernel Forwarding: <strong>{{ natStatus?.ip_forwarding ? 'Habilitado (net.ipv4.ip_forward=1)' : 'Desabilitado' }}</strong></span>
          </div>

          <div>
            <button 
              v-if="natStatus?.enabled"
              @click="configureNat(false)" 
              :disabled="configuringNat"
              class="btn-disable-nat"
            >
              Desativar Roteamento NAT
            </button>
            <button 
              v-else
              @click="configureNat(true)" 
              :disabled="configuringNat"
              class="btn-enable-nat"
            >
              Ativar Compartilhamento (NAT)
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Seção Tabela de Regras -->
    <div class="fm-card">
      <div class="table-header-row">
        <div>
          <h3 class="section-title">
            <svg class="icon icon-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Regras Ativas Numeradas (ufw status numbered)
          </h3>
          <p class="section-desc">Regras avaliadas sequencialmente no kernel do Linux</p>
        </div>

        <div class="table-controls">
          <input 
            v-model="searchQuery" 
            type="text" 
            placeholder="Filtrar por porta ou IP..." 
            class="input-search"
          />
          <button @click="isRuleModalOpen = true" class="btn-add-rule">
            + Nova Regra
          </button>
        </div>
      </div>

      <div class="table-wrapper">
        <table class="rules-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Destino / Porta</th>
              <th>Ação</th>
              <th>Origem</th>
              <th>Comentário</th>
              <th class="text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filteredRules.length === 0">
              <td colspan="6" class="empty-cell">Nenhuma regra encontrada.</td>
            </tr>
            <tr v-for="rule in filteredRules" :key="rule.index">
              <td class="font-bold text-slate">{{ rule.index }}</td>
              <td class="text-amber font-mono font-bold">{{ rule.to }}</td>
              <td>
                <span :class="['rule-badge', rule.action.includes('ALLOW') ? 'badge-allow' : 'badge-deny']">
                  {{ rule.action }}
                </span>
              </td>
              <td class="font-mono text-slate">{{ rule.from_ip }}</td>
              <td class="italic text-slate-muted">{{ rule.comment || '—' }}</td>
              <td class="text-right">
                <button @click="deleteRule(rule.index)" class="btn-delete" title="Excluir regra">
                  &times;
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Nova Regra -->
    <div v-if="isRuleModalOpen" class="modal-overlay">
      <div class="modal-card">
        <div class="modal-header">
          <h4>Criar Nova Regra de Firewall</h4>
          <button @click="isRuleModalOpen = false" class="btn-close-modal">&times;</button>
        </div>

        <form @submit.prevent="createRule" class="modal-form">
          <div class="form-row">
            <div class="form-group">
              <label>Ação</label>
              <select v-model="newRule.action" class="input-control">
                <option value="allow">ALLOW</option>
                <option value="deny">DENY</option>
                <option value="reject">REJECT</option>
                <option value="limit">LIMIT</option>
              </select>
            </div>
            <div class="form-group">
              <label>Direção</label>
              <select v-model="newRule.direction" class="input-control">
                <option value="in">IN (Entrada)</option>
                <option value="out">OUT (Saída)</option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Porta ou Faixa *</label>
              <input v-model="newRule.port" type="text" placeholder="Ex: 80 ou 8080:8090" required class="input-control font-mono" />
            </div>
            <div class="form-group">
              <label>Protocolo</label>
              <select v-model="newRule.protocol" class="input-control">
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="any">ANY</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Origem (From IP)</label>
            <input v-model="newRule.from_ip" type="text" placeholder="Anywhere ou ex: 192.168.1.0/24" class="input-control font-mono" />
          </div>

          <div class="form-group">
            <label>Comentário</label>
            <input v-model="newRule.comment" type="text" placeholder="Ex: Web HTTPS" class="input-control" />
          </div>

          <div class="modal-actions">
            <button type="button" @click="isRuleModalOpen = false" class="btn-cancel">Cancelar</button>
            <button type="submit" class="btn-submit" :disabled="submittingRule">Criar Regra</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

// Definições de Tipos
interface UfwRuleItem {
  index: number;
  to: string;
  action: string;
  from_ip: string;
  comment?: string;
}

interface UfwStatus {
  active: boolean;
  default_incoming: string;
  default_outgoing: string;
  rules: UfwRuleItem[];
}

interface FirewallProfileInfo {
  key: string;
  name: string;
  description: string;
  ports: string[];
}

interface NatStatusResponse {
  enabled: boolean;
  ip_forwarding: boolean;
  wan_interface?: string | null;
  lan_interface?: string | null;
  lan_subnet?: string | null;
}

interface NetworkInterface {
  name: string;
  is_up: boolean;
}

const emit = defineEmits<{
  (e: 'open-terminal', taskId: string, title?: string): void;
}>();

// Estados
const status = ref<UfwStatus | null>(null);
const profiles = ref<FirewallProfileInfo[]>([]);
const natStatus = ref<NatStatusResponse | null>(null);
const interfaces = ref<NetworkInterface[]>([]);
const loading = ref(false);
const togglingUfw = ref(false);
const isApplyingProfile = ref(false);
const configuringNat = ref(false);
const submittingRule = ref(false);
const isRuleModalOpen = ref(false);
const searchQuery = ref('');
const feedback = ref<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

const natForm = ref({
  wan_interface: '',
  lan_interface: '',
  lan_subnet: '',
});

const newRule = ref({
  action: 'allow',
  direction: 'in',
  port: '',
  protocol: 'tcp',
  from_ip: '',
  comment: '',
});

// Funções de API
const fetchJson = async (url: string, options?: RequestInit) => {
  const res = await fetch(`/api${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Erro HTTP ${res.status}`);
  }
  return res.json();
};

const loadAllData = async () => {
  loading.value = true;
  try {
    const [ufwRes, profRes, natRes, ifacesRes] = await Promise.all([
      fetchJson('/firewall/status').catch(() => null),
      fetchJson('/firewall/profiles').catch(() => []),
      fetchJson('/firewall/nat').catch(() => null),
      fetchJson('/network/interfaces').catch(() => []),
    ]);

    if (ufwRes) status.value = ufwRes;
    profiles.value = profRes || [];
    if (natRes) {
      natStatus.value = natRes;
      if (natRes.wan_interface) natForm.value.wan_interface = natRes.wan_interface;
      if (natRes.lan_interface) natForm.value.lan_interface = natRes.lan_interface;
      if (natRes.lan_subnet) natForm.value.lan_subnet = natRes.lan_subnet;
    }
    if (ifacesRes && ifacesRes.length > 0) {
      interfaces.value = ifacesRes;
      if (!natForm.value.wan_interface) natForm.value.wan_interface = ifacesRes[0].name;
      if (!natForm.value.lan_interface && ifacesRes.length > 1) natForm.value.lan_interface = ifacesRes[1].name;
    }
  } catch (err: any) {
    feedback.value = { type: 'error', text: err.message };
  } finally {
    loading.value = false;
  }
};

const toggleUfw = async () => {
  togglingUfw.value = true;
  feedback.value = null;
  try {
    const willEnable = !status.value?.active;
    const res = await fetchJson('/firewall/toggle', {
      method: 'POST',
      body: JSON.stringify({ enabled: willEnable }),
    });
    feedback.value = { type: 'info', text: 'Alteração do firewall submetida.' };
    emit('open-terminal', res.task_id, 'Firewall UFW Toggle');
    setTimeout(loadAllData, 2000);
  } catch (err: any) {
    feedback.value = { type: 'error', text: err.message };
  } finally {
    togglingUfw.value = false;
  }
};

const applyProfile = async (profileKey: string, name: string) => {
  isApplyingProfile.value = true;
  feedback.value = null;
  try {
    const res = await fetchJson('/firewall/profiles/apply', {
      method: 'POST',
      body: JSON.stringify({ profiles: [profileKey] }),
    });
    feedback.value = { type: 'success', text: `Perfil ${name} aplicado!` };
    emit('open-terminal', res.task_id, `Perfil: ${name}`);
    setTimeout(loadAllData, 2000);
  } catch (err: any) {
    feedback.value = { type: 'error', text: err.message };
  } finally {
    isApplyingProfile.value = false;
  }
};

const applyMultiProfiles = async (profileKeys: string[], name: string) => {
  isApplyingProfile.value = true;
  feedback.value = null;
  try {
    const res = await fetchJson('/firewall/profiles/apply', {
      method: 'POST',
      body: JSON.stringify({ profiles: profileKeys }),
    });
    feedback.value = { type: 'success', text: `Perfis ${name} aplicados!` };
    emit('open-terminal', res.task_id, `Perfis: ${name}`);
    setTimeout(loadAllData, 2000);
  } catch (err: any) {
    feedback.value = { type: 'error', text: err.message };
  } finally {
    isApplyingProfile.value = false;
  }
};

const deleteRule = async (index: number) => {
  if (!confirm(`Excluir regra #${index}?`)) return;
  try {
    const res = await fetchJson(`/firewall/rule/${index}`, { method: 'DELETE' });
    emit('open-terminal', res.task_id, `Excluir Regra #${index}`);
    setTimeout(loadAllData, 2000);
  } catch (err: any) {
    alert(err.message);
  }
};

const createRule = async () => {
  submittingRule.value = true;
  try {
    const res = await fetchJson('/firewall/rule', {
      method: 'POST',
      body: JSON.stringify({
        action: newRule.value.action,
        direction: newRule.value.direction,
        port: newRule.value.port,
        protocol: newRule.value.protocol,
        from_ip: newRule.value.from_ip || null,
        comment: newRule.value.comment || null,
      }),
    });
    isRuleModalOpen.value = false;
    newRule.value.port = '';
    newRule.value.comment = '';
    emit('open-terminal', res.task_id, `Regra UFW: ${newRule.value.port}`);
    setTimeout(loadAllData, 2000);
  } catch (err: any) {
    feedback.value = { type: 'error', text: err.message };
  } finally {
    submittingRule.value = false;
  }
};

const configureNat = async (enable: boolean) => {
  configuringNat.value = true;
  feedback.value = null;
  try {
    const res = await fetchJson('/firewall/nat', {
      method: 'POST',
      body: JSON.stringify({
        enabled: enable,
        wan_interface: natForm.value.wan_interface,
        lan_interface: natForm.value.lan_interface,
        lan_subnet: natForm.value.lan_subnet || null,
      }),
    });
    feedback.value = { type: 'success', text: enable ? 'Roteamento NAT ativado!' : 'Roteamento NAT desativado!' };
    emit('open-terminal', res.task_id, 'Configuração de NAT');
    setTimeout(loadAllData, 2000);
  } catch (err: any) {
    feedback.value = { type: 'error', text: err.message };
  } finally {
    configuringNat.value = false;
  }
};

const filteredRules = computed(() => {
  if (!status.value?.rules) return [];
  if (!searchQuery.value) return status.value.rules;
  const q = searchQuery.value.toLowerCase();
  return status.value.rules.filter((r) =>
    r.to.toLowerCase().includes(q) ||
    r.action.toLowerCase().includes(q) ||
    r.from_ip.toLowerCase().includes(q) ||
    (r.comment && r.comment.toLowerCase().includes(q))
  );
});

onMounted(() => {
  loadAllData();
});
</script>

<style scoped>
.firewall-manager-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  font-family: inherit;
  color: #f1f5f9;
}
.fm-card {
  background-color: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 1rem;
  padding: 1.25rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
}
.header-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.header-icon-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.icon-badge {
  padding: 0.625rem;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 0.75rem;
  color: #fbbf24;
}
.title {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
  color: #fff;
}
.subtitle {
  font-size: 0.75rem;
  color: #94a3b8;
  margin: 0.25rem 0 0;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.status-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  border-radius: 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
}
.badge-active {
  background: rgba(6, 78, 59, 0.8);
  border: 1px solid #047857;
  color: #6ee7b7;
}
.badge-inactive {
  background: rgba(136, 19, 55, 0.8);
  border: 1px solid #be123c;
  color: #fda4af;
}
.status-dot {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 9999px;
  background: currentColor;
}
.btn-toggle {
  padding: 0.5rem 1rem;
  border-radius: 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}
.btn-enable {
  background: #059669;
  color: #fff;
}
.btn-enable:hover {
  background: #10b981;
}
.btn-disable {
  background: rgba(136, 19, 55, 0.7);
  border-color: #be123c;
  color: #fecdd3;
}
.btn-disable:hover {
  background: #9f1239;
}
.btn-refresh {
  padding: 0.5rem;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 0.75rem;
  color: #94a3b8;
  cursor: pointer;
}
.btn-refresh:hover {
  color: #fff;
}
.spinning {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
  margin-top: 1.25rem;
  padding-top: 1.25rem;
  border-top: 1px solid #1e293b;
}
.metric-box {
  background: rgba(2, 6, 23, 0.6);
  border: 1px solid #1e293b;
  padding: 0.75rem;
  border-radius: 0.75rem;
}
.metric-label {
  font-size: 0.6875rem;
  color: #94a3b8;
  display: block;
  margin-bottom: 0.25rem;
}
.metric-value {
  font-size: 0.75rem;
  font-weight: 700;
}
.text-emerald { color: #34d399; }
.text-rose { color: #f87171; }
.text-amber { color: #fbbf24; }
.text-sky { color: #38bdf8; }
.text-slate { color: #94a3b8; }
.section-header {
  margin-bottom: 1rem;
}
.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
}
.section-desc {
  font-size: 0.75rem;
  color: #94a3b8;
  margin: 0.25rem 0 0;
}
.icon {
  width: 1rem;
  height: 1rem;
}
.quick-profiles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.75rem;
}
.profile-quick-btn {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.875rem;
  background: rgba(2, 6, 23, 0.7);
  border: 1px solid #1e293b;
  border-radius: 0.75rem;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
  color: inherit;
}
.profile-quick-btn:hover {
  background: #1e293b;
  border-color: #334155;
}
.profile-icon-wrap {
  padding: 0.5rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-indigo { background: rgba(99, 102, 241, 0.1); color: #818cf8; }
.icon-emerald { background: rgba(16, 185, 129, 0.1); color: #34d399; }
.icon-sky { background: rgba(14, 165, 233, 0.1); color: #38bdf8; }
.icon-amber { color: #fbbf24; }
.profile-text {
  flex: 1;
}
.profile-header-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.profile-name {
  font-size: 0.75rem;
  font-weight: 600;
  color: #fff;
}
.port-tag {
  font-size: 0.625rem;
  font-family: monospace;
  background: #020617;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  border: 1px solid #334155;
  color: #94a3b8;
}
.profile-sub {
  font-size: 0.6875rem;
  color: #94a3b8;
  margin: 0.25rem 0 0;
}
.nat-form-box {
  background: rgba(2, 6, 23, 0.7);
  border: 1px solid #1e293b;
  border-radius: 0.75rem;
  padding: 1rem;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.form-group label {
  font-size: 0.6875rem;
  font-weight: 500;
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
  border-color: #38bdf8;
}
.help-text {
  font-size: 0.625rem;
  color: #64748b;
}
.nat-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid #1e293b;
}
.nat-sysctl-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.6875rem;
  color: #94a3b8;
}
.status-dot-small {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: #64748b;
}
.status-dot-small.active {
  background: #34d399;
}
.btn-enable-nat {
  padding: 0.5rem 1rem;
  background: #0284c7;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
}
.btn-enable-nat:hover {
  background: #0369a1;
}
.btn-disable-nat {
  padding: 0.5rem 1rem;
  background: rgba(136, 19, 55, 0.8);
  border: 1px solid #be123c;
  color: #fecdd3;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 0.5rem;
  cursor: pointer;
}
.table-header-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}
.table-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.input-search {
  background: #020617;
  border: 1px solid #334155;
  border-radius: 0.5rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  color: #fff;
  outline: none;
}
.btn-add-rule {
  padding: 0.375rem 0.875rem;
  background: #d97706;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
}
.btn-add-rule:hover {
  background: #b45309;
}
.table-wrapper {
  overflow-x: auto;
  border: 1px solid #1e293b;
  border-radius: 0.75rem;
}
.rules-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
  text-align: left;
}
.rules-table th {
  background: #020617;
  padding: 0.625rem 0.875rem;
  color: #94a3b8;
  font-size: 0.625rem;
  text-transform: uppercase;
  border-bottom: 1px solid #1e293b;
}
.rules-table td {
  padding: 0.625rem 0.875rem;
  border-bottom: 1px solid #1e293b;
}
.rules-table tr:hover td {
  background: rgba(30, 41, 59, 0.4);
}
.rule-badge {
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-weight: 700;
}
.badge-allow {
  background: rgba(6, 78, 59, 0.6);
  border: 1px solid #047857;
  color: #6ee7b7;
}
.badge-deny {
  background: rgba(136, 19, 55, 0.6);
  border: 1px solid #be123c;
  color: #fda4af;
}
.btn-delete {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.125rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
}
.btn-delete:hover {
  color: #f87171;
  background: #1e293b;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 1rem;
}
.modal-card {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 1rem;
  max-width: 480px;
  width: 100%;
  padding: 1.5rem;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  border-bottom: 1px solid #1e293b;
  padding-bottom: 0.75rem;
}
.modal-header h4 {
  margin: 0;
  font-size: 0.875rem;
  color: #fff;
}
.btn-close-modal {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.25rem;
  cursor: pointer;
}
.modal-form {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid #1e293b;
}
.btn-cancel {
  padding: 0.5rem 1rem;
  background: #1e293b;
  color: #94a3b8;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  font-size: 0.75rem;
}
.btn-submit {
  padding: 0.5rem 1rem;
  background: #d97706;
  color: #fff;
  font-weight: 600;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  font-size: 0.75rem;
}
.alert-box {
  margin-top: 1rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.alert-success { background: rgba(6, 78, 59, 0.4); border: 1px solid #047857; color: #6ee7b7; }
.alert-error { background: rgba(136, 19, 55, 0.4); border: 1px solid #be123c; color: #fda4af; }
.alert-info { background: rgba(30, 58, 138, 0.4); border: 1px solid #1d4ed8; color: #93c5fd; }
.btn-close-alert { background: none; border: none; color: inherit; cursor: pointer; }
.font-mono { font-family: monospace; }
.text-right { text-align: right; }
.empty-cell { text-align: center; color: #64748b; padding: 2rem !important; }
</style>
