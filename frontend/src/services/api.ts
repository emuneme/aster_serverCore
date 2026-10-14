const API_BASE = '/api';

export interface SystemInfo {
  hostname: string;
  system: string;
  release: string;
  version: string;
  architecture: string;
  uptime_seconds: number;
  cpu: {
    cores_logical: number;
    cores_physical: number;
    usage_percent: number;
  };
  memory: {
    total_bytes: number;
    used_bytes: number;
    available_bytes: number;
    usage_percent: number;
  };
  disk: {
    total_bytes: number;
    used_bytes: number;
    free_bytes: number;
    usage_percent: number;
  };
  simulation_mode: boolean;
  is_root: boolean;
}

export interface ServiceStatus {
  name: string;
  description: string;
  port: number | null;
  active: boolean;
  enabled: boolean;
  status_text: string;
}

export interface NetworkInterface {
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

export interface SambaStatus {
  is_installed: boolean;
  is_provisioned: boolean;
  service_active: boolean;
  service_enabled: boolean;
  realm: string | null;
  domain: string | null;
  role: string | null;
  dns_backend: string | null;
  details: string | null;
}

export interface SambaPreflightResponse {
  can_provision: boolean;
  sam_ldb_exists: boolean;
  sam_ldb_path: string;
  smb_conf_exists: boolean;
  smb_conf_path: string;
  dns_port_busy: boolean;
  conflicting_services: string[];
  warnings: string[];
  blockers: string[];
}

export interface TaskInfo {
  id: string;
  command: string;
  command_args?: string[];
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  exit_code: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  log_file?: string;
  logs: string[];
}

export interface UfwRuleItem {
  index: number;
  to: string;
  action: string;
  from_ip: string;
  comment?: string;
}

export interface UfwStatus {
  active: boolean;
  default_incoming: string;
  default_outgoing: string;
  rules: UfwRuleItem[];
}

export interface FirewallProfileInfo {
  key: string;
  name: string;
  description: string;
  ports: string[];
}

export interface NatConfigRequest {
  enabled: boolean;
  wan_interface: string;
  lan_interface: string;
  lan_subnet?: string | null;
}

export interface NatStatusResponse {
  enabled: boolean;
  ip_forwarding: boolean;
  wan_interface?: string | null;
  lan_interface?: string | null;
  lan_subnet?: string | null;
  details?: string | null;
}

export interface DhcpLease {
  ip_address: string;
  mac_address: string;
  hostname: string;
  expire_time: string;
  client_id?: string;
}

export interface CpuMetrics {
  cpu_percent: number;
  cpu_count_logical: number;
  cpu_count_physical: number;
  load_avg: [number, number, number];
}

export interface MemoryMetrics {
  total: number;
  used: number;
  available: number;
  percent: number;
  swap_total: number;
  swap_used: number;
  swap_free: number;
  swap_percent: number;
}

export interface DiskPartitionMetrics {
  mountpoint: string;
  total: number;
  used: number;
  free: number;
  percent: number;
}

export interface NetworkRateItem {
  bytes_sent_per_sec: number;
  bytes_recv_per_sec: number;
  total_sent: number;
  total_recv: number;
}

export interface NetworkIoMetrics {
  total_sent_rate: number;
  total_recv_rate: number;
  interfaces: Record<string, NetworkRateItem>;
}

export interface ServiceStatusItem {
  name: string;
  display_name: string;
  active: boolean;
  status: string;
  description: string;
  port?: number | null;
  dns_port_open?: boolean;
}

export interface UptimeInfo {
  uptime_seconds: number;
  uptime_formatted: string;
  boot_time: number;
  hostname: string;
  fqdn: string;
}

export interface SystemMonitorPayload {
  timestamp: number;
  uptime: UptimeInfo;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disks: Record<string, DiskPartitionMetrics>;
  network_io: NetworkIoMetrics;
  services: Record<string, ServiceStatusItem>;
}

export interface ServiceActionResponse {
  success: boolean;
  service_name: string;
  action: string;
  active: boolean;
  status: string;
  message: string;
}

export interface ServiceLogsResponse {
  service_name: string;
  lines_count: number;
  logs: string[];
}

export interface WizardSetupRequest {
  network_interface: string;
  server_ip_cidr: string;
  gateway?: string | null;
  upstream_dns: string[];
  realm: string;
  domain: string;
  admin_password: string;
  enable_dhcp: boolean;
  dhcp_pool_start?: string | null;
  dhcp_pool_end?: string | null;
  lease_time: number;
  enable_firewall: boolean;
  allow_ssh: boolean;
}

export interface WizardSummary {
  server_ip: string;
  server_ip_cidr: string;
  interface: string;
  realm: string;
  domain: string;
  dhcp_enabled: boolean;
  dhcp_range: string;
  firewall_enabled: boolean;
  log_file: string;
}

// ==============================================================================
// AUTENTICAÇÃO E SESSÃO
// ==============================================================================

export interface LoginRequest {
  username: string;
  password: string;
  remember_me?: boolean;
}

export interface UserInfo {
  username: string;
  auth_type: 'pam' | 'local';
  role: string;
  display_name: string;
  is_sudo: boolean;
}

export interface ServerAuthInfo {
  hostname: string;
  os_name: string;
  is_production: boolean;
  server_ip: string | null;
  version: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user_info: UserInfo;
  server_info: ServerAuthInfo;
}

const TOKEN_KEY = 'sglinux_auth_token';
const USER_KEY = 'sglinux_auth_user';

export const authStorage = {
  getToken: (): string | null => {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  },
  getUser: (): UserInfo | null => {
    const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  setSession: (resp: LoginResponse, rememberMe = false): void => {
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem(TOKEN_KEY, resp.access_token);
    storage.setItem(USER_KEY, JSON.stringify(resp.user_info));
  },
  clearSession: (): void => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  },
};

// API Helper com injeção automática de token JWT Bearer
async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = authStorage.getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorDetail = 'Erro na requisição';
    try {
      const errData = await res.json();
      errorDetail = errData.detail || errData.message || JSON.stringify(errData);
    } catch {
      errorDetail = await res.text();
    }
    
    // Se for não autorizado (401) e não for o endpoint de login, limpa a sessão
    if (res.status === 401 && !endpoint.includes('/auth/login')) {
      authStorage.clearSession();
      window.dispatchEvent(new CustomEvent('sglinux-unauthorized'));
    }

    throw new Error(errorDetail);
  }

  return res.json();
}

export const api = {
  // System
  getSystemInfo: () => request<SystemInfo>('/system/info'),
  getServices: () => request<ServiceStatus[]>('/system/services'),
  installPackages: (packages: string[]) =>
    request<{ message: string; task_id: string; packages: string[] }>('/system/packages/install', {
      method: 'POST',
      body: JSON.stringify({ packages }),
    }),

  // Network
  getInterfaces: () => request<NetworkInterface[]>('/network/interfaces'),
  getNetplan: () => request<{ content: string; path: string; exists: boolean }>('/network/netplan'),
  previewNetplan: (config: any) => request<{ yaml: string }>('/network/netplan/preview', {
    method: 'POST',
    body: JSON.stringify(config),
  }),
  applyNetplan: (config: any) =>
    request<{ message: string; task_id: string; path: string }>('/network/netplan/apply', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
  applySimpleNetwork: (config: { interface: string; address: string; gateway?: string | null; nameservers: string[] }) =>
    request<{ message: string; task_id: string; path: string; log_file?: string }>('/network/apply', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  // Samba
  getSambaStatus: () => request<SambaStatus>('/samba/status'),
  getSambaPreflight: () => request<SambaPreflightResponse>('/samba/preflight'),
  previewSamba: (req: any) => request<{ content: string }>('/samba/preview', {
    method: 'POST',
    body: JSON.stringify(req),
  }),
  provisionSamba: (req: any) =>
    request<{ message: string; task_id: string; realm: string; domain: string; log_file?: string }>('/samba/provision', {
      method: 'POST',
      body: JSON.stringify(req),
    }),
  controlSambaService: (action: string) =>
    request<{ message: string; task_id: string }>(`/samba/service/${action}`, {
      method: 'POST',
    }),

  // DHCP
  getDhcpStatus: () => request<any>('/dhcp/status'),
  getDhcpLeases: () => request<DhcpLease[]>('/dhcp/leases'),
  previewDhcp: (config: any) => request<{ backend: string; content: string }>('/dhcp/preview', {
    method: 'POST',
    body: JSON.stringify(config),
  }),
  applyDhcp: (config: any) =>
    request<{ message: string; task_id: string; backend: string }>('/dhcp/apply', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  // Firewall & NAT
  getUfwStatus: () => request<UfwStatus>('/firewall/status'),
  toggleUfw: (enabled?: boolean) =>
    request<{ message: string; task_id: string }>('/firewall/toggle', {
      method: 'POST',
      body: JSON.stringify(enabled !== undefined ? { enabled } : {}),
    }),
  enableUfw: () => request<{ message: string; task_id: string }>('/firewall/enable', { method: 'POST' }),
  disableUfw: () => request<{ message: string; task_id: string }>('/firewall/disable', { method: 'POST' }),
  getFirewallProfiles: () => request<FirewallProfileInfo[]>('/firewall/profiles'),
  applyFirewallProfiles: (profiles: string[]) =>
    request<{ message: string; task_id: string; applied_profiles: string[] }>('/firewall/profiles/apply', {
      method: 'POST',
      body: JSON.stringify({ profiles }),
    }),
  addUfwRule: (rule: any) =>
    request<{ message: string; task_id: string; command?: string }>('/firewall/rule', {
      method: 'POST',
      body: JSON.stringify(rule),
    }),
  deleteUfwRule: (index: number) =>
    request<{ message: string; task_id: string }>(`/firewall/rule/${index}`, { method: 'DELETE' }),
  applySambaPreset: () =>
    request<{ message: string; task_id: string; ports_opened: string[] }>('/firewall/presets/samba-ad', {
      method: 'POST',
    }),
  configureNat: (config: NatConfigRequest) =>
    request<{ message: string; task_id: string; wan_interface: string; lan_interface: string; enabled: boolean }>(
      '/firewall/nat',
      {
        method: 'POST',
        body: JSON.stringify(config),
      }
    ),
  getNatStatus: () => request<NatStatusResponse>('/firewall/nat'),

  // Setup Wizard
  validateWizard: (req: WizardSetupRequest) =>
    request<{ valid: boolean; message: string }>('/wizard/validate', {
      method: 'POST',
      body: JSON.stringify(req),
    }),


  // Tasks
  getTasks: (limit = 20) => request<TaskInfo[]>(`/tasks?limit=${limit}`),
  getTask: (id: string) => request<TaskInfo>(`/tasks/${id}`),
  getTaskLog: async (id: string): Promise<string> => {
    const res = await fetch(`/api/tasks/${id}/log`);
    if (!res.ok) throw new Error('Não foi possível obter o log da tarefa');
    return res.text();
  },
  cancelTask: (id: string) => request<{ message: string; task_id: string }>(`/tasks/${id}/cancel`, { method: 'POST' }),

  // Autenticação & Sessão
  login: (credentials: LoginRequest) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),
  getAuthMe: () => request<UserInfo>('/auth/me'),
  getAuthStatus: () => request<ServerAuthInfo>('/auth/status'),
  logout: () => request<{ message: string; username: string }>('/auth/logout', { method: 'POST' }),

  // Monitorização em Tempo Real (Telemetria & Serviços)
  getMonitorSnapshot: () => request<SystemMonitorPayload>('/monitor/snapshot'),
  controlMonitorService: (serviceName: string, action: 'start' | 'stop' | 'restart') =>
    request<ServiceActionResponse>(`/monitor/service/${serviceName}/${action}`, {
      method: 'POST',
    }),
  getMonitorServiceLogs: (serviceName: string, lines = 100) =>
    request<ServiceLogsResponse>(`/monitor/logs/${serviceName}?lines=${lines}`),
};

