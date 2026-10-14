<template>
  <div class="dashboard-pro-container">
    <!-- 1. Top Command Center Banner -->
    <div class="hero-command-banner">
      <div class="hero-glow-sky" />
      <div class="hero-glow-orange" />
      <div class="hero-grid-pattern" />

      <div class="hero-content">
        <div>
          <div class="badge-status-row">
            <span class="badge-noc">NOC ServerCore</span>
            <span v-if="connectionStatus === 'connected'" class="status-pill online">
              <span class="live-dot" />
              Telemetria Ativa (WebSocket 2s)
            </span>
            <span v-else class="status-pill fallback">
              <span class="warn-dot" />
              Polling HTTP (Fallback Ativo)
            </span>
            <span class="update-label font-mono">• Atualizado às {{ lastUpdateTime }}</span>
          </div>

          <h1 class="hero-title">
            <div class="server-icon-wrap">
              <svg class="icon icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
                <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
                <line x1="6" x2="6.01" y1="6" y2="6" />
                <line x1="6" x2="6.01" y1="18" y2="18" />
              </svg>
            </div>
            <span>{{ hostname }}</span>
            <span v-if="cleanFqdn" class="fqdn-badge">{{ cleanFqdn }}</span>
          </h1>

          <p class="hero-subtitle">
            Kernel Linux Estável • Uptime: <strong class="text-white font-mono">{{ uptimeFormatted }}</strong> • 
            <span class="text-emerald font-semibold">{{ onlineServicesCount }} de {{ serviceList.length }} Serviços Críticos Ativos</span>
          </p>
        </div>

        <div class="hero-actions">
          <button @click="$emit('open-terminal', '', 'Terminal Geral')" class="btn-glow-dark">
            <svg class="icon icon-sky" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" x2="20" y1="19" y2="19" />
            </svg>
            <span>Terminal Global</span>
          </button>
        </div>
      </div>

      <!-- Action Feedback Banner -->
      <div v-if="actionFeedback" :class="['feedback-toast', actionFeedback.type]">
        <span>{{ actionFeedback.message }}</span>
        <button @click="actionFeedback = null" class="btn-close-toast">✕</button>
      </div>
    </div>

    <!-- 2. Linha Superior: 4 KPI Cards com Gauges Circulares SVG -->
    <div class="kpi-cards-grid">
      <!-- CPU -->
      <div class="pro-kpi-card">
        <div class="kpi-card-header">
          <span class="kpi-card-label">Processador (CPU)</span>
          <div class="kpi-badge-icon sky">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect width="16" height="16" x="4" y="4" rx="2" />
              <rect width="6" height="6" x="9" y="9" rx="1" />
              <path d="M15 2v2M9 2v2M20 15h2M20 9h2M9 20v2M15 20v2M2 9h2M2 15h2" />
            </svg>
          </div>
        </div>

        <div class="kpi-gauge-row">
          <div class="gauge-wrap">
            <svg width="105" height="105" class="rotate-gauge">
              <circle cx="52.5" cy="52.5" r="44" fill="none" stroke="#1E293B" stroke-width="9" stroke-dasharray="207 276" stroke-linecap="round" />
              <circle 
                cx="52.5" 
                cy="52.5" 
                r="44" 
                fill="none" 
                stroke="#0EA5E9" 
                stroke-width="9" 
                stroke-dasharray="207 276" 
                :stroke-dashoffset="207 - (Math.min(cpuPercent, 100) / 100) * 207" 
                stroke-linecap="round" 
                class="gauge-progress"
              />
            </svg>
            <div class="gauge-inner">
              <span class="gauge-number">{{ Math.round(cpuPercent) }}%</span>
              <span class="gauge-sub">CARGA</span>
            </div>
          </div>

          <div class="kpi-side-info font-mono">
            <div>Núcleos: <strong>{{ cpuCores }}</strong></div>
            <div class="text-sub">Físicos: {{ cpuPhysical }}</div>
            <div :class="['tag-status', cpuPercent > 80 ? 'danger' : 'success']">
              {{ cpuPercent > 80 ? 'Carga Alta' : 'Operacional' }}
            </div>
          </div>
        </div>

        <div class="kpi-card-footer font-mono">
          <span>Load Avg:</span>
          <span>{{ loadAvg[0]?.toFixed(2) }} • {{ loadAvg[1]?.toFixed(2) }} • {{ loadAvg[2]?.toFixed(2) }}</span>
        </div>
      </div>

      <!-- RAM -->
      <div class="pro-kpi-card">
        <div class="kpi-card-header">
          <span class="kpi-card-label">Memória RAM</span>
          <div class="kpi-badge-icon purple">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M2 12h20M2 17h20M2 7h20" />
            </svg>
          </div>
        </div>

        <div class="kpi-gauge-row">
          <div class="gauge-wrap">
            <svg width="105" height="105" class="rotate-gauge">
              <circle cx="52.5" cy="52.5" r="44" fill="none" stroke="#1E293B" stroke-width="9" stroke-dasharray="207 276" stroke-linecap="round" />
              <circle 
                cx="52.5" 
                cy="52.5" 
                r="44" 
                fill="none" 
                stroke="#8B5CF6" 
                stroke-width="9" 
                stroke-dasharray="207 276" 
                :stroke-dashoffset="207 - (Math.min(ramPercent, 100) / 100) * 207" 
                stroke-linecap="round" 
                class="gauge-progress"
              />
            </svg>
            <div class="gauge-inner">
              <span class="gauge-number">{{ Math.round(ramPercent) }}%</span>
              <span class="gauge-sub">USO</span>
            </div>
          </div>

          <div class="kpi-side-info font-mono">
            <div class="text-white font-bold">{{ formatBytes(ramUsed) }}</div>
            <div class="text-sub">de {{ formatBytes(ramTotal) }}</div>
            <div class="text-sub">Disp: {{ formatBytes(ramAvail) }}</div>
          </div>
        </div>

        <div class="kpi-card-footer font-mono">
          <span>Swap ({{ swapPercent }}%):</span>
          <span>{{ swapTotal > 0 ? formatBytes(swapUsed) + ' / ' + formatBytes(swapTotal) : 'Desativado' }}</span>
        </div>
      </div>

      <!-- Disco -->
      <div class="pro-kpi-card">
        <div class="kpi-card-header">
          <span class="kpi-card-label">Armazenamento (/)</span>
          <div class="kpi-badge-icon emerald">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" x2="2" y1="12" y2="12" />
              <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
            </svg>
          </div>
        </div>

        <div class="kpi-gauge-row">
          <div class="gauge-wrap">
            <svg width="105" height="105" class="rotate-gauge">
              <circle cx="52.5" cy="52.5" r="44" fill="none" stroke="#1E293B" stroke-width="9" stroke-dasharray="207 276" stroke-linecap="round" />
              <circle 
                cx="52.5" 
                cy="52.5" 
                r="44" 
                fill="none" 
                stroke="#10B981" 
                stroke-width="9" 
                stroke-dasharray="207 276" 
                :stroke-dashoffset="207 - (Math.min(rootDisk.percent, 100) / 100) * 207" 
                stroke-linecap="round" 
                class="gauge-progress"
              />
            </svg>
            <div class="gauge-inner">
              <span class="gauge-number">{{ Math.round(rootDisk.percent) }}%</span>
              <span class="gauge-sub">RAIZ</span>
            </div>
          </div>

          <div class="kpi-side-info font-mono">
            <div class="text-white font-bold">{{ formatBytes(rootDisk.free) }} livres</div>
            <div class="text-sub">Total: {{ formatBytes(rootDisk.total) }}</div>
            <div class="text-emerald font-bold">Saudável</div>
          </div>
        </div>

        <div class="kpi-card-footer font-mono">
          <span>Partição /var:</span>
          <span>{{ varDisk ? varDisk.percent + '% (' + formatBytes(varDisk.free) + ' livres)' : 'Integrada em /' }}</span>
        </div>
      </div>

      <!-- Rede -->
      <div class="pro-kpi-card">
        <div class="kpi-card-header">
          <span class="kpi-card-label">Taxa de Rede (I/O)</span>
          <div class="kpi-badge-icon amber">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
        </div>

        <div class="net-rates-container font-mono">
          <div class="net-rate-row sky-bg">
            <span>↓ Download (RX)</span>
            <strong class="sky font-black">{{ formatRate(monitorData?.network_io?.total_recv_rate || 0) }}</strong>
          </div>
          <div class="net-rate-row orange-bg">
            <span>↑ Upload (TX)</span>
            <strong class="orange font-black">{{ formatRate(monitorData?.network_io?.total_sent_rate || 0) }}</strong>
          </div>
        </div>

        <div class="kpi-card-footer font-mono">
          <span>Uptime:</span>
          <span class="text-white font-bold">{{ uptimeFormatted }}</span>
        </div>
      </div>
    </div>

    <!-- 3. Seção Central: Matriz de Serviços Críticos -->
    <div class="pro-matrix-card">
      <div class="matrix-header">
        <div class="matrix-title-wrap">
          <div class="p-icon-box">
            <svg class="icon sky" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div>
            <h2 class="matrix-title">Serviços de Infraestrutura Crítica</h2>
            <p class="matrix-sub">Supervisão contínua com controlo systemd e auditoria de logs</p>
          </div>
        </div>
        <span class="matrix-count-badge font-mono">{{ onlineServicesCount }} de {{ serviceList.length }} online</span>
      </div>

      <div class="services-vertical-list">
        <div 
          v-for="svc in serviceList" 
          :key="svc.id"
          class="service-pro-row"
        >
          <div class="service-meta-left">
            <div :class="['service-icon-box', svc.active ? 'active' : 'inactive']">
              <svg class="icon icon-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect width="20" height="14" x="2" y="5" rx="2" />
                <line x1="2" x2="22" y1="10" y2="10" />
              </svg>
            </div>
            <div>
              <div class="service-title-line">
                <span class="svc-title">{{ svc.title }}</span>
                <span :class="['svc-pill-badge', svc.active ? 'online' : 'offline']">
                  <span class="dot-led" />
                  {{ svc.active ? 'ONLINE' : 'OFFLINE' }}
                </span>
                <span class="svc-id font-mono">({{ svc.id }})</span>
              </div>
              <p class="svc-desc">{{ svc.desc }}</p>
              <div class="svc-specs font-mono">
                <span class="spec-highlight">{{ svc.portLabel }}</span>
                <span>• Protocolo: {{ svc.protocol }}</span>
              </div>
            </div>
          </div>

          <div class="service-actions-right">
            <button @click="openLogs(svc.id, svc.title)" class="btn-tool btn-logs">
              Logs
            </button>
            <button 
              @click="handleServiceAction(svc.id, svc.active ? 'stop' : 'start')"
              :disabled="loadingAction === svc.id"
              :class="['btn-tool', svc.active ? 'btn-stop' : 'btn-start']"
            >
              {{ svc.active ? 'Parar' : 'Iniciar' }}
            </button>
            <button 
              @click="handleServiceAction(svc.id, 'restart')"
              :disabled="loadingAction === svc.id"
              class="btn-tool btn-restart"
            >
              Reiniciar
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 4. Seção Inferior: Gráficos de Telemetria (NOC Visualizer) -->
    <div class="telemetry-charts-grid">
      <!-- CPU Chart -->
      <div class="chart-pro-box">
        <div class="chart-pro-head">
          <div>
            <h3 class="chart-pro-title">Utilização do Processador (CPU %)</h3>
            <p class="chart-pro-sub">Amostragem histórica nos últimos 60 segundos</p>
          </div>
          <span class="chart-badge-now sky font-mono">{{ Math.round(cpuPercent) }}% Atual</span>
        </div>

        <div class="chart-canvas-wrap">
          <svg v-if="history.length >= 2" class="svg-oscilloscope" viewBox="0 0 500 150" preserveAspectRatio="none">
            <defs>
              <linearGradient id="vueGlowCpu" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#0EA5E9" stop-opacity="0.45" />
                <stop offset="100%" stop-color="#0EA5E9" stop-opacity="0.0" />
              </linearGradient>
            </defs>
            <line v-for="y in [0, 37.5, 75, 112.5, 150]" :key="y" x1="0" :y1="y" x2="500" :y2="y" stroke="#1E293B" stroke-dasharray="4 4" stroke-width="1" />
            <polygon :points="cpuAreaPoints" fill="url(#vueGlowCpu)" />
            <polyline :points="cpuLinePoints" fill="none" stroke="#0EA5E9" stroke-width="2.5" stroke-linecap="round" />
          </svg>
          <div v-else class="chart-idle-text font-mono">A recolher amostras de CPU...</div>
        </div>

        <div class="chart-time-labels font-mono">
          <span>-60s</span>
          <span>-30s</span>
          <span>Agora</span>
        </div>
      </div>

      <!-- Network Chart -->
      <div class="chart-pro-box">
        <div class="chart-pro-head">
          <div>
            <h3 class="chart-pro-title">Taxa de Transferência de Rede</h3>
            <p class="chart-pro-sub">Download (RX) e Upload (TX) em tempo real</p>
          </div>
          <div class="chart-rates-legend font-mono">
            <span class="sky font-bold">RX: {{ formatRate(monitorData?.network_io?.total_recv_rate || 0) }}</span>
            <span class="orange font-bold">TX: {{ formatRate(monitorData?.network_io?.total_sent_rate || 0) }}</span>
          </div>
        </div>

        <div class="chart-canvas-wrap">
          <svg v-if="history.length >= 2" class="svg-oscilloscope" viewBox="0 0 500 150" preserveAspectRatio="none">
            <defs>
              <linearGradient id="vueGlowRx" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#0EA5E9" stop-opacity="0.3" />
                <stop offset="100%" stop-color="#0EA5E9" stop-opacity="0.0" />
              </linearGradient>
            </defs>
            <line v-for="y in [0, 37.5, 75, 112.5, 150]" :key="y" x1="0" :y1="y" x2="500" :y2="y" stroke="#1E293B" stroke-dasharray="4 4" stroke-width="1" />
            <polygon :points="netAreaPoints" fill="url(#vueGlowRx)" />
            <polyline :points="netRxPoints" fill="none" stroke="#0EA5E9" stroke-width="2.5" stroke-linecap="round" />
            <polyline :points="netTxPoints" fill="none" stroke="#F97316" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 3" />
          </svg>
          <div v-else class="chart-idle-text font-mono">A monitorizar tráfego de rede...</div>
        </div>

        <div class="chart-time-labels font-mono">
          <span>-60s</span>
          <span class="text-sub">Linha Ciano = RX • Linha Laranja = TX</span>
          <span>Agora</span>
        </div>
      </div>
    </div>

    <!-- 5. Modal de Logs Dark Obsidian (journalctl) -->
    <div v-if="activeLogService" class="modal-backdrop-blur">
      <div class="terminal-modal-dialog">
        <div class="terminal-header">
          <div>
            <h3 class="terminal-title">Logs de Diagnóstico: {{ activeLogService.title }}</h3>
            <p class="terminal-subtitle font-mono">journalctl -u {{ activeLogService.id }} --no-pager -n 100</p>
          </div>
          <div class="terminal-controls">
            <button @click="copyLogs" class="btn-chip">Copiar</button>
            <button @click="fetchLogs(activeLogService.id)" class="btn-chip">Atualizar</button>
            <button @click="activeLogService = null" class="btn-close-modal">✕</button>
          </div>
        </div>

        <div class="terminal-body font-mono">
          <div v-if="loadingLogs" class="terminal-loading">A recolher logs do journalctl...</div>
          <div v-else-if="!logLines.length" class="terminal-loading">Nenhum registo encontrado.</div>
          <div v-else v-for="(line, idx) in logLines" :key="idx" class="term-line">
            <span class="line-num">{{ idx + 1 }}</span>
            <span :class="{'err-highlight': /error|failed|failure/i.test(line)}">{{ line }}</span>
          </div>
        </div>

        <div class="terminal-footer font-mono">
          <span>{{ logLines.length }} linhas lidas</span>
          <button @click="activeLogService = null" class="btn-close-term">Fechar Janela</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

const monitorData = ref<any>(null);
const connectionStatus = ref<'connected' | 'fallback'>('fallback');
const lastUpdateTime = ref<string>('');
const history = ref<Array<{ cpu: number; rx: number; tx: number }>>([]);
const loadingAction = ref<string | null>(null);
const actionFeedback = ref<{ message: string; type: 'success' | 'error' } | null>(null);

const activeLogService = ref<{ id: string; title: string } | null>(null);
const logLines = ref<string[]>([]);
const loadingLogs = ref(false);

let ws: WebSocket | null = null;
let pollTimer: any = null;

const hostname = computed(() => monitorData.value?.uptime?.hostname || 'aster-server');
const fqdn = computed(() => monitorData.value?.uptime?.fqdn || '');
const cleanFqdn = computed(() => {
  const f = (fqdn.value || '').toLowerCase().trim();
  const h = (hostname.value || '').toLowerCase().trim();
  if (
    !f ||
    f.includes('.arpa') ||
    f.includes('ip6') ||
    f.startsWith('1.0.0.0.') ||
    f.startsWith('127.') ||
    f === 'localhost' ||
    f === 'localhost.localdomain' ||
    f === 'broadcasthost' ||
    f === h ||
    f === `${h}.local`
  ) {
    return null;
  }
  return fqdn.value;
});
const uptimeFormatted = computed(() => monitorData.value?.uptime?.uptime_formatted || '...');

const cpuPercent = computed(() => monitorData.value?.cpu?.cpu_percent || 0);
const cpuCores = computed(() => monitorData.value?.cpu?.cpu_count_logical || 1);
const cpuPhysical = computed(() => monitorData.value?.cpu?.cpu_count_physical || 1);
const loadAvg = computed(() => monitorData.value?.cpu?.load_avg || [0, 0, 0]);

const ramPercent = computed(() => monitorData.value?.memory?.percent || 0);
const ramUsed = computed(() => monitorData.value?.memory?.used || 0);
const ramTotal = computed(() => monitorData.value?.memory?.total || 1);
const ramAvail = computed(() => monitorData.value?.memory?.available || (ramTotal.value - ramUsed.value));
const swapPercent = computed(() => monitorData.value?.memory?.swap_percent || 0);
const swapUsed = computed(() => monitorData.value?.memory?.swap_used || 0);
const swapTotal = computed(() => monitorData.value?.memory?.swap_total || 0);

const rootDisk = computed(() => monitorData.value?.disks?.['/'] || { percent: 0, free: 0, total: 1 });
const varDisk = computed(() => monitorData.value?.disks?.['/var']);

const serviceList = computed(() => [
  {
    id: 'samba-ad-dc',
    title: 'Samba 4 Active Directory DC',
    desc: 'Controlador de Domínio com Kerberos KDC, Catálogo LDAP, SYSVOL e DNS integrado.',
    portLabel: 'Portas 389, 88, 445',
    protocol: 'Kerberos / LDAP',
    active: monitorData.value?.services?.['samba-ad-dc']?.active ?? false
  },
  {
    id: 'kea-dhcp4-server',
    title: 'ISC Kea DHCPv4 Server',
    desc: 'Servidor DHCP com alocação dinâmica, leases CSV e reservas estáticas.',
    portLabel: 'Porta 67/UDP',
    protocol: 'DHCP',
    active: monitorData.value?.services?.['kea-dhcp4-server']?.active ?? false
  },
  {
    id: 'dns',
    title: 'Serviço de Nomes DNS',
    desc: 'Resolução de nomes do Active Directory e encaminhadores recursivos.',
    portLabel: 'Porta 53/UDP',
    protocol: 'DNS',
    active: monitorData.value?.services?.['dns']?.active ?? false
  },
  {
    id: 'ufw',
    title: 'Firewall Perimetral UFW',
    desc: 'Filtragem de pacotes Netfilter, proteção perimetral e NAT/Masquerade.',
    portLabel: 'Netfilter',
    protocol: 'iptables',
    active: monitorData.value?.services?.['ufw']?.active ?? false
  },
  {
    id: 'ssh',
    title: 'Acesso Remoto Seguro (SSH)',
    desc: 'Daemon OpenSSH para gestão administrativa e automação CLI.',
    portLabel: 'Porta 22/TCP',
    protocol: 'SSH-2.0',
    active: monitorData.value?.services?.['ssh']?.active ?? false
  }
]);

const onlineServicesCount = computed(() => serviceList.value.filter(s => s.active).length);

const cpuLinePoints = computed(() => {
  if (history.value.length < 2) return '';
  return history.value.map((pt, i) => {
    const x = (i / (history.value.length - 1)) * 500;
    const y = 150 - (Math.min(pt.cpu, 100) / 100) * 150;
    return `${x},${y}`;
  }).join(' ');
});

const cpuAreaPoints = computed(() => {
  if (!cpuLinePoints.value) return '';
  return `0,150 ${cpuLinePoints.value} 500,150`;
});

const netRxPoints = computed(() => {
  if (history.value.length < 2) return '';
  const max = Math.max(10, ...history.value.map(h => Math.max(h.rx, h.tx)));
  return history.value.map((pt, i) => {
    const x = (i / (history.value.length - 1)) * 500;
    const y = 150 - (Math.min(pt.rx, max) / max) * 140;
    return `${x},${y}`;
  }).join(' ');
});

const netAreaPoints = computed(() => {
  if (!netRxPoints.value) return '';
  return `0,150 ${netRxPoints.value} 500,150`;
});

const netTxPoints = computed(() => {
  if (history.value.length < 2) return '';
  const max = Math.max(10, ...history.value.map(h => Math.max(h.rx, h.tx)));
  return history.value.map((pt, i) => {
    const x = (i / (history.value.length - 1)) * 500;
    const y = 150 - (Math.min(pt.tx, max) / max) * 140;
    return `${x},${y}`;
  }).join(' ');
});

const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return '0 B';
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
};

const formatRate = (rate: number) => {
  if (!rate || rate <= 0) return '0 KB/s';
  if (rate >= 1024 * 1024) return `${(rate / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(rate / 1024).toFixed(1)} KB/s`;
};

const updateTelemetry = (data: any) => {
  monitorData.value = data;
  lastUpdateTime.value = new Date().toLocaleTimeString();

  history.value.push({
    cpu: data.cpu?.cpu_percent || 0,
    rx: Math.round((data.network_io?.total_recv_rate || 0) / 1024),
    tx: Math.round((data.network_io?.total_sent_rate || 0) / 1024),
  });
  if (history.value.length > 30) history.value.shift();
};

const initConnection = () => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  try {
    ws = new WebSocket(`${proto}//${window.location.host}/ws/monitor`);
    ws.onopen = () => {
      connectionStatus.value = 'connected';
      if (pollTimer) clearInterval(pollTimer);
    };
    ws.onmessage = (e) => {
      try {
        updateTelemetry(JSON.parse(e.data));
      } catch (err) {}
    };
    ws.onclose = () => {
      connectionStatus.value = 'fallback';
      startPolling();
    };
  } catch (err) {
    startPolling();
  }
};

const startPolling = () => {
  if (pollTimer) return;
  const fetchSnap = async () => {
    try {
      const res = await fetch('/api/monitor/snapshot');
      if (res.ok) updateTelemetry(await res.json());
    } catch (e) {}
  };
  fetchSnap();
  pollTimer = setInterval(fetchSnap, 2500);
};

const handleServiceAction = async (serviceName: string, action: string) => {
  loadingAction.value = serviceName;
  try {
    const res = await fetch(`/api/monitor/service/${serviceName}/${action}`, { method: 'POST' });
    const data = await res.json();
    actionFeedback.value = {
      message: `${serviceName}: ${data.message}`,
      type: data.success ? 'success' : 'error'
    };
  } catch (e: any) {
    actionFeedback.value = { message: `Erro: ${e.message}`, type: 'error' };
  } finally {
    loadingAction.value = null;
    setTimeout(() => { actionFeedback.value = null; }, 5000);
  }
};

const openLogs = (id: string, title: string) => {
  activeLogService.value = { id, title };
  fetchLogs(id);
};

const fetchLogs = async (id: string) => {
  loadingLogs.value = true;
  try {
    const res = await fetch(`/api/monitor/logs/${id}`);
    const data = await res.json();
    logLines.value = data.logs || [];
  } catch (e: any) {
    logLines.value = [`Falha ao obter logs: ${e.message}`];
  } finally {
    loadingLogs.value = false;
  }
};

const copyLogs = () => {
  navigator.clipboard.writeText(logLines.value.join('\n'));
};

onMounted(() => {
  initConnection();
});

onUnmounted(() => {
  if (ws) ws.close();
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped>
.dashboard-pro-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  color: #e2e8f0;
}
.hero-command-banner {
  position: relative;
  overflow: hidden;
  border-radius: 1rem;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  border: 1px solid #334155;
  padding: 1.75rem;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
}
.hero-glow-sky {
  position: absolute;
  top: -5rem;
  right: -5rem;
  width: 20rem;
  height: 20rem;
  border-radius: 50%;
  background: rgba(14, 165, 233, 0.1);
  filter: blur(4rem);
  pointer-events: none;
}
.hero-glow-orange {
  position: absolute;
  bottom: -5rem;
  left: -5rem;
  width: 20rem;
  height: 20rem;
  border-radius: 50%;
  background: rgba(249, 115, 22, 0.08);
  filter: blur(4rem);
  pointer-events: none;
}
.hero-content {
  position: relative;
  z-index: 10;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.25rem;
}
.badge-status-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}
.badge-noc {
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  background: #1e293b;
  color: #cbd5e1;
  padding: 0.2rem 0.5rem;
  border-radius: 0.35rem;
  border: 1px solid #334155;
}
.status-pill {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.2rem 0.65rem;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.status-pill.online {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.35);
}
.status-pill.fallback {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.35);
}
.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #34d399;
}
.warn-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #fbbf24;
}
.update-label {
  font-size: 0.7rem;
  color: #64748b;
}
.hero-title {
  font-size: 1.85rem;
  font-weight: 900;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.2rem 0;
}
.server-icon-wrap {
  padding: 0.5rem;
  border-radius: 0.75rem;
  background: rgba(14, 165, 233, 0.15);
  border: 1px solid rgba(14, 165, 233, 0.3);
  color: #0ea5e9;
}
.fqdn-badge {
  font-size: 0.85rem;
  color: #94a3b8;
  font-weight: normal;
}
.hero-subtitle {
  font-size: 0.8rem;
  color: #94a3b8;
  margin-top: 0.25rem;
}
.hero-actions {
  display: flex;
  gap: 0.75rem;
}
.btn-glow-dark {
  background: #0f172a;
  color: #f1f5f9;
  border: 1px solid #334155;
  padding: 0.6rem 1.15rem;
  border-radius: 0.75rem;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s;
}
.btn-glow-dark:hover {
  background: #1e293b;
  border-color: #0ea5e9;
}
.feedback-toast {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 0.65rem;
  font-size: 0.8rem;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.feedback-toast.success {
  background: rgba(6, 78, 59, 0.8);
  color: #6ee7b7;
  border: 1px solid #059669;
}
.feedback-toast.error {
  background: rgba(136, 19, 55, 0.8);
  color: #fda4af;
  border: 1px solid #e11d48;
}
.btn-close-toast {
  background: transparent;
  border: none;
  color: #cbd5e1;
  cursor: pointer;
}
.kpi-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 1.25rem;
}
.pro-kpi-card {
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid #334155;
  border-radius: 1rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: border-color 0.2s;
}
.pro-kpi-card:hover {
  border-color: rgba(14, 165, 233, 0.4);
}
.kpi-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}
.kpi-card-label {
  font-size: 0.75rem;
  font-weight: 800;
  color: #cbd5e1;
  text-transform: uppercase;
}
.kpi-badge-icon {
  padding: 0.4rem;
  border-radius: 0.5rem;
}
.kpi-badge-icon.sky { background: rgba(14, 165, 233, 0.15); color: #0ea5e9; }
.kpi-badge-icon.purple { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
.kpi-badge-icon.emerald { background: rgba(16, 185, 129, 0.15); color: #10b981; }
.kpi-badge-icon.amber { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
.kpi-gauge-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0.75rem 0;
}
.gauge-wrap {
  position: relative;
  width: 105px;
  height: 105px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rotate-gauge {
  transform: rotate(135deg);
}
.gauge-progress {
  transition: stroke-dashoffset 0.6s ease;
}
.gauge-inner {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.gauge-number {
  font-size: 1.25rem;
  font-weight: 900;
  font-family: monospace;
  color: #fff;
}
.gauge-sub {
  font-size: 0.65rem;
  font-weight: 800;
  color: #94a3b8;
}
.kpi-side-info {
  font-size: 0.75rem;
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.tag-status {
  font-size: 0.65rem;
  font-weight: 800;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  margin-top: 0.25rem;
}
.tag-status.success { background: rgba(16, 185, 129, 0.2); color: #34d399; }
.tag-status.danger { background: rgba(239, 68, 68, 0.2); color: #f87171; }
.kpi-card-footer {
  margin-top: 0.75rem;
  padding-top: 0.6rem;
  border-top: 1px solid rgba(51, 65, 85, 0.6);
  font-size: 0.7rem;
  color: #94a3b8;
  display: flex;
  justify-content: space-between;
}
.net-rates-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0.75rem 0;
}
.net-rate-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
}
.sky-bg { background: rgba(14, 165, 233, 0.1); border: 1px solid rgba(14, 165, 233, 0.2); }
.orange-bg { background: rgba(249, 115, 22, 0.1); border: 1px solid rgba(249, 115, 22, 0.2); }
.pro-matrix-card {
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid #334155;
  border-radius: 1rem;
  padding: 1.5rem;
}
.matrix-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #334155;
  padding-bottom: 1rem;
  margin-bottom: 1rem;
}
.matrix-title-wrap {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.p-icon-box {
  padding: 0.5rem;
  border-radius: 0.5rem;
  background: rgba(14, 165, 233, 0.15);
}
.matrix-title {
  font-size: 1.15rem;
  font-weight: 800;
  color: #fff;
  margin: 0;
}
.matrix-sub {
  font-size: 0.75rem;
  color: #94a3b8;
  margin: 0.15rem 0 0 0;
}
.matrix-count-badge {
  font-size: 0.75rem;
  background: #0f172a;
  border: 1px solid #334155;
  padding: 0.3rem 0.75rem;
  border-radius: 9999px;
  color: #cbd5e1;
}
.services-vertical-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.service-pro-row {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  transition: all 0.2s;
}
.service-pro-row:hover {
  border-color: #475569;
}
.service-meta-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.service-icon-box {
  padding: 0.65rem;
  border-radius: 0.65rem;
}
.service-icon-box.active { background: rgba(14, 165, 233, 0.15); color: #0ea5e9; }
.service-icon-box.inactive { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
.service-title-line {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}
.svc-title {
  font-weight: 800;
  font-size: 0.95rem;
  color: #fff;
}
.svc-pill-badge {
  font-size: 0.65rem;
  font-weight: 800;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.svc-pill-badge.online {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.4);
}
.svc-pill-badge.offline {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.4);
}
.dot-led {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #34d399;
}
.svc-id { font-size: 0.75rem; color: #64748b; }
.svc-desc { font-size: 0.75rem; color: #94a3b8; margin: 0.25rem 0; }
.svc-specs { font-size: 0.7rem; color: #64748b; }
.spec-highlight { color: #cbd5e1; font-weight: 600; }
.service-actions-right {
  display: flex;
  gap: 0.5rem;
}
.btn-tool {
  padding: 0.45rem 0.85rem;
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 0.5rem;
  cursor: pointer;
  border: none;
  transition: all 0.15s;
}
.btn-logs { background: #1e293b; color: #38bdf8; border: 1px solid #334155; }
.btn-start { background: #10b981; color: #fff; }
.btn-stop { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
.btn-restart { background: #0ea5e9; color: #fff; }
.telemetry-charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 1.5rem;
}
.chart-pro-box {
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid #334155;
  border-radius: 1rem;
  padding: 1.25rem;
}
.chart-pro-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}
.chart-pro-title { font-size: 0.875rem; font-weight: 800; color: #fff; margin: 0; }
.chart-pro-sub { font-size: 0.7rem; color: #94a3b8; margin: 0.2rem 0 0 0; }
.chart-badge-now {
  font-size: 0.75rem;
  font-weight: 800;
  padding: 0.25rem 0.6rem;
  border-radius: 0.4rem;
  background: rgba(14, 165, 233, 0.15);
  border: 1px solid rgba(14, 165, 233, 0.3);
}
.chart-rates-legend { display: flex; gap: 0.75rem; font-size: 0.75rem; }
.chart-canvas-wrap { height: 145px; width: 100%; position: relative; }
.svg-oscilloscope { width: 100%; height: 100%; }
.chart-idle-text { height: 100%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: #64748b; }
.chart-time-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.65rem;
  color: #64748b;
  margin-top: 0.5rem;
  padding-top: 0.35rem;
  border-top: 1px solid rgba(51, 65, 85, 0.6);
}
.modal-backdrop-blur {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}
.terminal-modal-dialog {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 1rem;
  width: 90%;
  max-width: 850px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}
.terminal-header {
  padding: 1.15rem 1.5rem;
  background: #1e293b;
  border-bottom: 1px solid #334155;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.terminal-title { font-size: 1rem; font-weight: 800; color: #fff; margin: 0; }
.terminal-subtitle { font-size: 0.75rem; color: #94a3b8; margin-top: 0.2rem; }
.terminal-controls { display: flex; gap: 0.5rem; align-items: center; }
.btn-chip {
  background: #0f172a;
  color: #e2e8f0;
  border: 1px solid #334155;
  padding: 0.35rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}
.btn-close-modal {
  background: transparent;
  color: #94a3b8;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
}
.terminal-body {
  flex: 1;
  background: #050811;
  padding: 1.25rem;
  overflow-y: auto;
  font-size: 0.75rem;
  line-height: 1.45;
}
.term-line { display: flex; gap: 0.75rem; }
.line-num { color: #475569; user-select: none; min-width: 28px; text-align: right; }
.err-highlight { color: #f87171; background: rgba(248, 113, 113, 0.1); }
.terminal-footer {
  padding: 0.85rem 1.5rem;
  background: #1e293b;
  border-top: 1px solid #334155;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: #94a3b8;
}
.btn-close-term {
  background: #0ea5e9;
  color: #fff;
  border: none;
  padding: 0.45rem 1rem;
  border-radius: 0.5rem;
  font-weight: 700;
  cursor: pointer;
}
.icon { width: 1.15rem; height: 1.15rem; }
.icon-md { width: 1.35rem; height: 1.35rem; }
.icon-lg { width: 1.6rem; height: 1.6rem; }
.sky { color: #0ea5e9; }
.orange { color: #f97316; }
.text-emerald { color: #10b981; }
.text-sub { color: #64748b; }
</style>
