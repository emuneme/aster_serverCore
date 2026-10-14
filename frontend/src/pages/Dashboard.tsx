import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Cpu, 
  HardDrive, 
  Shield, 
  Users, 
  Globe, 
  Terminal, 
  Activity,
  RotateCcw,
  Play,
  Square,
  FileText,
  RefreshCw,
  Copy,
  Check,
  X,
  ArrowDown,
  ArrowUp,
  Server,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Search,
  ChevronRight,
  Sparkles,
  Wifi
} from 'lucide-react';
import { 
  SystemInfo, 
  ServiceStatus, 
  TaskInfo, 
  SystemMonitorPayload,
  api 
} from '../services/api';

interface DashboardProps {
  systemInfo: SystemInfo | null;
  services: ServiceStatus[];
  tasks: TaskInfo[];
  onOpenTerminalForTask: (taskId: string, title?: string) => void;
  onNavigateTab: (tab: string) => void;
  onRefreshData: () => void;
}

interface MetricHistoryPoint {
  timeLabel: string;
  cpuPercent: number;
  netRxKbps: number;
  netTxKbps: number;
}

// Componente de Medidor Radial Circular (Circular Gauge)
interface CircularGaugeProps {
  value: number; // 0 a 100
  size?: number;
  strokeWidth?: number;
  gradientId: string;
  startColor: string;
  endColor: string;
  label: string;
  sublabel?: string;
  valueSuffix?: string;
}

const CircularGauge: React.FC<CircularGaugeProps> = ({
  value,
  size = 110,
  strokeWidth = 9,
  gradientId,
  startColor,
  endColor,
  label,
  sublabel,
  valueSuffix = '%'
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Arco parcial de 240 graus para efeito de velocímetro de NOC
  const arcLength = circumference * 0.75;
  const safeValue = Math.min(Math.max(value, 0), 100);
  const strokeDashoffset = arcLength - (safeValue / 100) * arcLength;

  return (
    <div className="relative flex flex-col items-center justify-center">
      <svg 
        width={size} 
        height={size} 
        className="rotate-[135deg] overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={startColor} />
            <stop offset="100%" stopColor={endColor} />
          </linearGradient>
          <filter id={`glow-${gradientId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Arco de fundo (Track) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1E293B"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
        />

        {/* Arco de valor (Fill) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          filter={`url(#glow-${gradientId})`}
          className="transition-all duration-700 ease-out"
        />
      </svg>

      {/* Rótulo Central */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
        <div className="flex items-baseline space-x-0.5">
          <span className="text-xl font-black font-mono tracking-tight text-white drop-shadow-sm">
            {Math.round(safeValue)}
          </span>
          <span className="text-xs font-bold text-slate-400">
            {valueSuffix}
          </span>
        </div>
        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-0.5">
          {label}
        </span>
        {sublabel && (
          <span className="text-[9px] text-slate-500 font-mono mt-0.5">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({
  systemInfo: initialSystemInfo,
  onOpenTerminalForTask,
  onNavigateTab,
  onRefreshData,
}) => {
  // Telemetria em Tempo Real
  const [monitorData, setMonitorData] = useState<SystemMonitorPayload | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'fallback'>('connecting');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  
  // Histórico para gráficos (últimos 30 pontos = ~60s)
  const [history, setHistory] = useState<MetricHistoryPoint[]>([]);

  // Ações em Serviços
  const [actionLoading, setActionLoading] = useState<Record<string, 'start' | 'stop' | 'restart' | null>>({});
  const [actionFeedback, setActionFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modal de Logs (journalctl)
  const [logModalService, setLogModalService] = useState<{ name: string; title: string } | null>(null);
  const [serviceLogs, setServiceLogs] = useState<string[]>([]);
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // WebSocket Ref
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const pollingIntervalRef = useRef<any>(null);

  // Formatação de bytes para GB / MB
  const formatBytes = (bytes: number, decimals = 1) => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  // Formatação de taxa de rede (B/s -> KB/s ou MB/s)
  const formatRate = (bytesPerSec: number) => {
    if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
    if (bytesPerSec >= 1024 * 1024) {
      return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  };

  // Processa novo pacote de telemetria recebido
  const processTelemetryUpdate = (data: SystemMonitorPayload) => {
    setMonitorData(data);
    setLastUpdate(new Date());

    const now = new Date(data.timestamp * 1000);
    const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    
    const rxKbps = Math.round((data.network_io.total_recv_rate / 1024) * 10) / 10;
    const txKbps = Math.round((data.network_io.total_sent_rate / 1024) * 10) / 10;

    setHistory((prev) => {
      const next = [
        ...prev,
        {
          timeLabel,
          cpuPercent: Math.round(data.cpu.cpu_percent * 10) / 10,
          netRxKbps: rxKbps,
          netTxKbps: txKbps,
        }
      ];
      if (next.length > 30) {
        return next.slice(next.length - 30);
      }
      return next;
    });
  };

  // Conexão WebSocket resiliente
  useEffect(() => {
    let isMounted = true;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/monitor`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setConnectionStatus('connected');
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data: SystemMonitorPayload = JSON.parse(event.data);
            processTelemetryUpdate(data);
          } catch (e) {
            console.error('Erro ao processar mensagem do WebSocket:', e);
          }
        };

        ws.onerror = () => {
          if (!isMounted) return;
          startPollingFallback();
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setConnectionStatus('fallback');
          startPollingFallback();
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMounted) connectWebSocket();
          }, 6000);
        };
      } catch (err) {
        startPollingFallback();
      }
    };

    const startPollingFallback = () => {
      if (pollingIntervalRef.current) return;
      setConnectionStatus('fallback');
      
      api.getMonitorSnapshot()
        .then((snapshot) => {
          if (isMounted) processTelemetryUpdate(snapshot);
        })
        .catch(() => {});

      pollingIntervalRef.current = setInterval(() => {
        if (!isMounted) return;
        api.getMonitorSnapshot()
          .then((snapshot) => {
            if (isMounted) processTelemetryUpdate(snapshot);
          })
          .catch(() => {});
      }, 2500);
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, []);

  // Executar Ação num Serviço (start / stop / restart)
  const handleServiceAction = async (serviceName: string, action: 'start' | 'stop' | 'restart') => {
    setActionLoading((prev) => ({ ...prev, [serviceName]: action }));
    setActionFeedback(null);
    try {
      const res = await api.controlMonitorService(serviceName, action);
      setActionFeedback({
        message: `Serviço ${serviceName}: ${res.message} (Estado atual: ${res.status})`,
        type: res.success ? 'success' : 'error'
      });

      const updated = await api.getMonitorSnapshot();
      processTelemetryUpdate(updated);
      onRefreshData();
    } catch (err: any) {
      setActionFeedback({
        message: `Erro ao executar ${action} em ${serviceName}: ${err.message || 'Falha no comando'}`,
        type: 'error'
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [serviceName]: null }));
      setTimeout(() => setActionFeedback(null), 6000);
    }
  };

  // Abrir Modal de Logs
  const handleOpenLogs = async (serviceName: string, title: string) => {
    setLogModalService({ name: serviceName, title });
    setLoadingLogs(true);
    setServiceLogs([]);
    setLogSearchQuery('');
    setCopiedLogs(false);
    try {
      const res = await api.getMonitorServiceLogs(serviceName, 100);
      setServiceLogs(res.logs || []);
    } catch (err: any) {
      setServiceLogs([`Erro ao obter logs do serviço ${serviceName}: ${err.message}`]);
    } finally {
      setLoadingLogs(false);
      setTimeout(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  const handleReloadLogs = async () => {
    if (!logModalService) return;
    setLoadingLogs(true);
    try {
      const res = await api.getMonitorServiceLogs(logModalService.name, 100);
      setServiceLogs(res.logs || []);
    } catch (err: any) {
      setServiceLogs([`Erro ao recarregar logs: ${err.message}`]);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleCopyLogs = () => {
    if (!filteredLogs.length) return;
    navigator.clipboard.writeText(filteredLogs.join('\n'));
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2500);
  };

  // Filtragem de logs no modal
  const filteredLogs = useMemo(() => {
    if (!logSearchQuery.trim()) return serviceLogs;
    const q = logSearchQuery.toLowerCase();
    return serviceLogs.filter(line => line.toLowerCase().includes(q));
  }, [serviceLogs, logSearchQuery]);

  // Extração segura das métricas
  const cpuPercent = monitorData?.cpu.cpu_percent ?? initialSystemInfo?.cpu.usage_percent ?? 0;
  const cpuCores = monitorData?.cpu.cpu_count_logical ?? initialSystemInfo?.cpu.cores_logical ?? 1;
  const cpuPhysical = monitorData?.cpu.cpu_count_physical ?? initialSystemInfo?.cpu.cores_physical ?? 1;
  const loadAvg = monitorData?.cpu.load_avg ?? [0, 0, 0];

  const ramPercent = monitorData?.memory.percent ?? initialSystemInfo?.memory.usage_percent ?? 0;
  const ramUsed = monitorData?.memory.used ?? initialSystemInfo?.memory.used_bytes ?? 0;
  const ramTotal = monitorData?.memory.total ?? initialSystemInfo?.memory.total_bytes ?? 1;
  const ramAvail = monitorData?.memory.available ?? (ramTotal - ramUsed);
  const swapPercent = monitorData?.memory.swap_percent ?? 0;
  const swapUsed = monitorData?.memory.swap_used ?? 0;
  const swapTotal = monitorData?.memory.swap_total ?? 0;

  const rootDisk = monitorData?.disks?.['/'] ?? {
    mountpoint: '/',
    total: initialSystemInfo?.disk.total_bytes ?? 1,
    used: initialSystemInfo?.disk.used_bytes ?? 0,
    free: initialSystemInfo?.disk.free_bytes ?? 1,
    percent: initialSystemInfo?.disk.usage_percent ?? 0
  };
  const varDisk = monitorData?.disks?.['/var'];

  const uptimeFormatted = monitorData?.uptime.uptime_formatted ?? (initialSystemInfo ? `${Math.floor(initialSystemInfo.uptime_seconds / 3600)}h` : '...');
  const hostname = monitorData?.uptime.hostname ?? initialSystemInfo?.hostname ?? 'aster-server';
  const fqdn = monitorData?.uptime.fqdn ?? hostname;

  // Sanitização estrita de FQDN para eliminar strings feias de DNS reverso (.ip6.arpa, loopback)
  const cleanFqdn = useMemo(() => {
    if (!fqdn) return null;
    const lower = fqdn.toLowerCase().trim();
    const hlower = hostname.toLowerCase().trim();
    if (
      lower.includes('.arpa') ||
      lower.includes('ip6') ||
      lower.startsWith('1.0.0.0.') ||
      lower.startsWith('127.') ||
      lower === 'localhost' ||
      lower === 'localhost.localdomain' ||
      lower === 'broadcasthost' ||
      lower === hlower ||
      lower === `${hlower}.local`
    ) {
      return null;
    }
    return fqdn;
  }, [fqdn, hostname]);

  // Lista padronizada dos serviços requeridos com metadados ricos
  const targetServices = [
    {
      id: 'samba-ad-dc',
      title: 'Samba 4 Active Directory DC',
      desc: 'Controlador de Domínio com Kerberos KDC, Catálogo LDAP, SYSVOL e DNS integrado.',
      ports: '389, 88, 445, 636, 49152:65535/tcp',
      protocol: 'Kerberos / LDAP',
      navTab: 'samba',
      data: monitorData?.services?.['samba-ad-dc'],
      accentColor: 'from-orange-500/20 to-amber-500/10 text-orange-400 border-orange-500/30'
    },
    {
      id: 'kea-dhcp4-server',
      title: 'ISC Kea DHCPv4 Server',
      desc: 'Servidor DHCP de alta performance com alocação dinâmica, leases CSV e reservas estáticas.',
      ports: 'Porta 67/UDP (Broadcast)',
      protocol: 'BOOTP / DHCP',
      navTab: 'dhcp',
      data: monitorData?.services?.['kea-dhcp4-server'],
      accentColor: 'from-sky-500/20 to-blue-500/10 text-sky-400 border-sky-500/30'
    },
    {
      id: 'dns',
      title: 'Serviço de Nomes DNS',
      desc: 'Resolução direta/reversa de nomes do AD, encaminhadores recursivos e registros SRV.',
      ports: 'Porta 53/UDP & 53/TCP',
      protocol: 'DNS Protocol',
      navTab: 'samba',
      data: monitorData?.services?.['dns'],
      accentColor: 'from-indigo-500/20 to-violet-500/10 text-indigo-400 border-indigo-500/30'
    },
    {
      id: 'ufw',
      title: 'Firewall Perimetral UFW',
      desc: 'Filtragem de pacotes Netfilter, proteção contra invasões, preset AD DC e NAT/Masquerade.',
      ports: 'Tabelas do Kernel Linux',
      protocol: 'iptables / Netfilter',
      navTab: 'firewall',
      data: monitorData?.services?.['ufw'],
      accentColor: 'from-emerald-500/20 to-teal-500/10 text-emerald-400 border-emerald-500/30'
    },
    {
      id: 'ssh',
      title: 'Acesso Remoto Seguro (OpenSSH)',
      desc: 'Daemon SSH com criptografia de ponta a ponta para gestão administrativa e automação CLI.',
      ports: 'Porta 22/TCP',
      protocol: 'SSH-2.0',
      navTab: null,
      data: monitorData?.services?.['ssh'],
      accentColor: 'from-slate-500/20 to-slate-600/10 text-slate-300 border-slate-500/30'
    }
  ];

  const onlineServicesCount = targetServices.filter(s => s.data?.active).length;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* =========================================================================
          1. TOP COMMAND CENTER BANNER (NOC HERO)
          ========================================================================= */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 border border-slate-800 p-6 md:p-8 shadow-xl shadow-black/40">
        {/* Glow de fundo e linhas cibernéticas */}
        <div className="absolute -right-20 -top-20 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px] opacity-15 pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-widest bg-slate-800 text-slate-300 border border-slate-700/80 shadow-sm">
                NOC ServerCore
              </span>

              {connectionStatus === 'connected' ? (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-950/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-2" />
                  Telemetria Ativa (WebSocket 2s)
                </span>
              ) : (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-amber-400 mr-2" />
                  Polling HTTP (Fallback Ativo)
                </span>
              )}

              <span className="text-xs text-slate-400 font-mono hidden sm:inline-block">
                • Atualizado às {lastUpdate.toLocaleTimeString()}
              </span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex flex-wrap items-center gap-3">
                <div className="p-2.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 shadow-inner shrink-0">
                  <Server className="w-6 h-6 sm:w-7 sm:h-7" />
                </div>
                <span className="break-words">{hostname}</span>
                {cleanFqdn && (
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-mono font-medium bg-slate-800 text-sky-400 border border-slate-700/80 shadow-sm">
                    {cleanFqdn}
                  </span>
                )}
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1.5 flex flex-wrap items-center gap-2">
                <span>Kernel Linux Estável</span>
                <span>•</span>
                <span>Uptime: <strong className="text-slate-200 font-mono">{uptimeFormatted}</strong></span>
                <span>•</span>
                <span className="text-emerald-400 font-medium">
                  {onlineServicesCount} de {targetServices.length} Serviços Críticos Ativos
                </span>
              </p>
            </div>
          </div>

          {/* Botões de Ação de Alto Nível */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => onOpenTerminalForTask('', 'Terminal Geral de Sistema')}
              className="flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-xl bg-slate-800/90 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-slate-600 transition-all shadow-md hover:shadow-sky-500/5 group"
            >
              <Terminal className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
              <span>Terminal Global</span>
            </button>

            <button
              onClick={() => onNavigateTab('wizard')}
              className="flex items-center space-x-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white transition-all shadow-lg shadow-orange-950/40 hover:shadow-orange-900/60 group"
            >
              <Sparkles className="w-4 h-4 text-amber-200 group-hover:rotate-12 transition-transform" />
              <span>Setup Wizard (Unificado)</span>
            </button>
          </div>
        </div>

        {/* Feedback de Ação em Serviço */}
        {actionFeedback && (
          <div className={`mt-5 p-3.5 rounded-xl text-xs font-semibold flex items-center space-x-3 border transition-all animate-fade-in ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80 shadow-lg shadow-emerald-950/40'
              : 'bg-rose-950/60 text-rose-300 border-rose-800/80 shadow-lg shadow-rose-950/40'
          }`}>
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
            )}
            <span className="flex-1">{actionFeedback.message}</span>
            <button 
              onClick={() => setActionFeedback(null)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* =========================================================================
          2. LINHA SUPERIOR: 4 KPI CARDS COM GAUGES CIRCULARES & METADADOS
          ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        {/* KPI 1: PROCESSADOR (CPU GAUGE) */}
        <div className="bg-slate-800/90 backdrop-blur-sm border border-slate-700/80 hover:border-sky-500/40 p-5 rounded-2xl shadow-sm hover:shadow-lg hover:shadow-sky-500/5 transition-all flex flex-col justify-between group">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Processador (CPU)</span>
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 group-hover:bg-sky-500/20 transition-colors">
              <Cpu className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-center justify-between my-2">
            <CircularGauge
              value={cpuPercent}
              gradientId="cpuGaugeGrad"
              startColor={cpuPercent > 80 ? '#EF4444' : cpuPercent > 60 ? '#F97316' : '#0EA5E9'}
              endColor={cpuPercent > 80 ? '#F87171' : cpuPercent > 60 ? '#FBBF24' : '#38BDF8'}
              label="Carga"
            />
            <div className="space-y-1.5 text-right font-mono">
              <div className="text-xs text-slate-400">
                Núcleos: <strong className="text-slate-200">{cpuCores}</strong>
              </div>
              <div className="text-[11px] text-slate-500">
                Físicos: <span className="text-slate-300">{cpuPhysical}</span>
              </div>
              <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${
                cpuPercent > 80 ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
              }`}>
                {cpuPercent > 80 ? 'Sob Carga Alta' : 'Operação Estável'}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Load Avg (1/5/15m):</span>
            <span className="text-slate-200 font-semibold">
              {loadAvg[0]?.toFixed(2)} • {loadAvg[1]?.toFixed(2)} • {loadAvg[2]?.toFixed(2)}
            </span>
          </div>
        </div>

        {/* KPI 2: MEMÓRIA RAM & SWAP */}
        <div className="bg-slate-800/90 backdrop-blur-sm border border-slate-700/80 hover:border-purple-500/40 p-5 rounded-2xl shadow-sm hover:shadow-lg hover:shadow-purple-500/5 transition-all flex flex-col justify-between group">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Memória RAM</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20 transition-colors">
              <Layers className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-center justify-between my-2">
            <CircularGauge
              value={ramPercent}
              gradientId="ramGaugeGrad"
              startColor={ramPercent > 85 ? '#EF4444' : '#8B5CF6'}
              endColor={ramPercent > 85 ? '#F87171' : '#C084FC'}
              label="Uso"
            />
            <div className="space-y-1 text-right font-mono">
              <div className="text-xs text-slate-300 font-bold">
                {formatBytes(ramUsed)}
              </div>
              <div className="text-[11px] text-slate-400">
                de {formatBytes(ramTotal)}
              </div>
              <div className="text-[10px] text-slate-500">
                Disp: {formatBytes(ramAvail)}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Swap ({swapPercent}%):</span>
            <span className="text-slate-200 font-semibold">
              {swapTotal > 0 ? `${formatBytes(swapUsed)} / ${formatBytes(swapTotal)}` : 'Desativado'}
            </span>
          </div>
        </div>

        {/* KPI 3: ARMAZENAMENTO EM DISCO (GAUGE / E /VAR) */}
        <div className="bg-slate-800/90 backdrop-blur-sm border border-slate-700/80 hover:border-emerald-500/40 p-5 rounded-2xl shadow-sm hover:shadow-lg hover:shadow-emerald-500/5 transition-all flex flex-col justify-between group">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Armazenamento (/)</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-center justify-between my-2">
            <CircularGauge
              value={rootDisk.percent}
              gradientId="diskGaugeGrad"
              startColor={rootDisk.percent > 85 ? '#EF4444' : '#10B981'}
              endColor={rootDisk.percent > 85 ? '#F87171' : '#34D399'}
              label="Raiz /"
            />
            <div className="space-y-1 text-right font-mono">
              <div className="text-xs text-slate-300 font-bold">
                {formatBytes(rootDisk.free)} livres
              </div>
              <div className="text-[11px] text-slate-400">
                Total: {formatBytes(rootDisk.total)}
              </div>
              <div className="text-[10px] text-emerald-400 font-semibold">
                Espaço Saudável
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Partição /var:</span>
            <span className="text-slate-200 font-semibold">
              {varDisk ? `${varDisk.percent}% (${formatBytes(varDisk.free)} livres)` : 'Integrada em /'}
            </span>
          </div>
        </div>

        {/* KPI 4: TELEMETRIA DE REDE & UPTIME */}
        <div className="bg-slate-800/90 backdrop-blur-sm border border-slate-700/80 hover:border-amber-500/40 p-5 rounded-2xl shadow-sm hover:shadow-lg hover:shadow-amber-500/5 transition-all flex flex-col justify-between group">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Taxa de Rede (I/O)</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 transition-colors">
              <Wifi className="w-4 h-4" />
            </div>
          </div>

          <div className="my-2 space-y-2.5">
            {/* Download RX */}
            <div className="flex items-center justify-between bg-slate-900/60 p-2.5 rounded-xl border border-slate-750">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400">
                  <ArrowDown className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-semibold text-slate-300">Recebido (RX)</span>
              </div>
              <span className="text-sm font-extrabold font-mono text-sky-400">
                {formatRate(monitorData?.network_io.total_recv_rate ?? 0)}
              </span>
            </div>

            {/* Upload TX */}
            <div className="flex items-center justify-between bg-slate-900/60 p-2.5 rounded-xl border border-slate-750">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-orange-500/20 text-orange-400">
                  <ArrowUp className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-semibold text-slate-300">Enviado (TX)</span>
              </div>
              <span className="text-sm font-extrabold font-mono text-orange-400">
                {formatRate(monitorData?.network_io.total_sent_rate ?? 0)}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Uptime:</span>
            <span className="text-slate-200 font-bold">{uptimeFormatted}</span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          3. SEÇÃO CENTRAL: PAINEL DE SERVIÇOS DE INFRAESTRUTURA (MATRIX MODULAR)
          ========================================================================= */}
      <div className="bg-slate-800/90 backdrop-blur-sm border border-slate-700/80 rounded-2xl p-6 shadow-xl shadow-black/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-700/80">
          <div>
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-sky-500/15 text-sky-400">
                <Activity className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Serviços de Infraestrutura Crítica
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Supervisão em tempo real do systemd com ações imediatas de reinicialização e auditoria de logs
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-slate-900 text-slate-300 border border-slate-700">
              {onlineServicesCount} de {targetServices.length} online
            </span>
          </div>
        </div>

        {/* Grid de Serviços */}
        <div className="grid grid-cols-1 gap-3.5">
          {targetServices.map((svc) => {
            const isOnline = svc.data?.active ?? false;
            const currentAction = actionLoading[svc.id];
            const isRestarting = currentAction === 'restart';
            const isToggling = currentAction === 'start' || currentAction === 'stop';

            return (
              <div 
                key={svc.id}
                className="bg-slate-850/80 hover:bg-slate-850 border border-slate-700/70 hover:border-slate-600 rounded-xl p-4 md:p-5 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 group"
              >
                {/* Lado Esquerdo: Ícone + Título + Status */}
                <div className="flex items-start sm:items-center space-x-4 min-w-0">
                  <div className={`p-3 rounded-xl border shrink-0 bg-gradient-to-br ${svc.accentColor}`}>
                    {svc.id === 'samba-ad-dc' && <Users className="w-5 h-5" />}
                    {svc.id === 'kea-dhcp4-server' && <Globe className="w-5 h-5" />}
                    {svc.id === 'dns' && <Radio className="w-5 h-5" />}
                    {svc.id === 'ufw' && <Shield className="w-5 h-5" />}
                    {svc.id === 'ssh' && <Terminal className="w-5 h-5" />}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center space-x-3 flex-wrap">
                      <h3 className="font-bold text-white text-sm sm:text-base group-hover:text-sky-300 transition-colors">
                        {svc.title}
                      </h3>

                      {/* Badge de Status com LED */}
                      {isOnline ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-950/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1.5 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                          ONLINE
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/15 text-rose-300 border border-rose-500/40">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mr-1.5" />
                          OFFLINE
                        </span>
                      )}

                      <span className="text-xs text-slate-500 font-mono">
                        ({svc.id})
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mt-1 line-clamp-1">
                      {svc.desc}
                    </p>

                    <div className="flex items-center space-x-3 mt-1.5 text-[11px] text-slate-500 font-mono">
                      <span className="text-slate-400 font-semibold">{svc.ports}</span>
                      <span>•</span>
                      <span>Protocolo: <strong className="text-slate-300">{svc.protocol}</strong></span>
                      {svc.data?.status && (
                        <>
                          <span>•</span>
                          <span>Estado: <span className="text-slate-300">{svc.data.status}</span></span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Lado Direito: Botões de Ação Rápida */}
                <div className="flex items-center space-x-2 shrink-0 self-end lg:self-center pt-2 lg:pt-0">
                  {/* Atalho para aba */}
                  {svc.navTab && (
                    <button
                      onClick={() => onNavigateTab(svc.navTab!)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 transition-colors inline-flex items-center space-x-1"
                      title={`Ir para a configuração dedicada de ${svc.title}`}
                    >
                      <span>Configurar</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  )}

                  {/* Botão Ver Logs */}
                  <button
                    onClick={() => handleOpenLogs(svc.id, svc.title)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-750 text-sky-400 border border-slate-700 hover:border-sky-500/40 transition-all inline-flex items-center space-x-1.5 shadow-sm"
                    title={`Ver logs de diagnóstico via journalctl`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Logs</span>
                  </button>

                  {/* Botão Parar / Iniciar */}
                  <button
                    onClick={() => handleServiceAction(svc.id, isOnline ? 'stop' : 'start')}
                    disabled={isToggling || isRestarting}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border shadow-sm inline-flex items-center space-x-1.5 ${
                      isOnline
                        ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30 hover:border-rose-500/50'
                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:border-emerald-500/50'
                    }`}
                  >
                    {isToggling ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : isOnline ? (
                      <Square className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    <span>{isOnline ? 'Parar' : 'Iniciar'}</span>
                  </button>

                  {/* Botão Reiniciar */}
                  <button
                    onClick={() => handleServiceAction(svc.id, 'restart')}
                    disabled={isRestarting || isToggling}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-sky-500 hover:bg-sky-600 text-white transition-all shadow-md shadow-sky-950/40 inline-flex items-center space-x-1.5"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${isRestarting ? 'animate-spin' : ''}`} />
                    <span>Reiniciar</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          4. SEÇÃO INFERIOR: GRÁFICOS EM TEMPO REAL (NOC OSCILLOSCOPE)
          ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico 1: CPU Load History */}
        <div className="bg-slate-800/90 backdrop-blur-sm border border-slate-700/80 rounded-2xl p-6 shadow-xl shadow-black/20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center space-x-2">
                <Cpu className="w-4 h-4 text-sky-400" />
                <h3 className="font-bold text-white text-sm">
                  Utilização do Processador (CPU %)
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Amostragem histórica nos últimos 60 segundos
              </p>
            </div>
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-400 border border-sky-500/30 shadow-inner">
              {cpuPercent}% Atual
            </span>
          </div>

          {/* SVG Line Chart */}
          <div className="h-44 w-full relative pt-2">
            {history.length < 2 ? (
              <div className="h-full flex items-center justify-center text-xs font-mono text-slate-500">
                A recolher amostras de CPU em tempo real...
              </div>
            ) : (
              <svg className="w-full h-full overflow-visible" viewBox="0 0 500 150" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="proCpuGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Linhas de Grade de Fundo (0%, 25%, 50%, 75%, 100%) */}
                {[0, 37.5, 75, 112.5, 150].map((y, idx) => (
                  <line 
                    key={idx} 
                    x1="0" 
                    y1={y} 
                    x2="500" 
                    y2={y} 
                    stroke="#1E293B" 
                    strokeDasharray="4 4" 
                    strokeWidth="1" 
                  />
                ))}

                {/* Polígono preenchido com gradiente */}
                {(() => {
                  const points = history.map((pt, index) => {
                    const x = (index / (history.length - 1)) * 500;
                    const y = 150 - (Math.min(pt.cpuPercent, 100) / 100) * 150;
                    return `${x},${y}`;
                  }).join(' ');
                  const areaPoints = `0,150 ${points} 500,150`;

                  return (
                    <>
                      <polygon points={areaPoints} fill="url(#proCpuGradient)" />
                      <polyline 
                        points={points} 
                        fill="none" 
                        stroke="#0EA5E9" 
                        strokeWidth="2.5" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                      />
                    </>
                  );
                })()}
              </svg>
            )}
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-3 pt-2 border-t border-slate-700/60">
            <span>-60s</span>
            <span>-30s</span>
            <span>Agora ({history[history.length - 1]?.timeLabel || ''})</span>
          </div>
        </div>

        {/* Gráfico 2: Network I/O Throughput */}
        <div className="bg-slate-800/90 backdrop-blur-sm border border-slate-700/80 rounded-2xl p-6 shadow-xl shadow-black/20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center space-x-2">
                <Globe className="w-4 h-4 text-orange-400" />
                <h3 className="font-bold text-white text-sm">
                  Taxa de Transferência de Rede
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Download (RX) e Upload (TX) em tempo real
              </p>
            </div>
            <div className="flex items-center space-x-3 text-xs font-mono">
              <span className="flex items-center text-sky-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-sky-400 mr-1.5" />
                RX: {formatRate(monitorData?.network_io.total_recv_rate ?? 0)}
              </span>
              <span className="flex items-center text-orange-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-orange-400 mr-1.5" />
                TX: {formatRate(monitorData?.network_io.total_sent_rate ?? 0)}
              </span>
            </div>
          </div>

          {/* SVG Line Chart para Rede */}
          <div className="h-44 w-full relative pt-2">
            {history.length < 2 ? (
              <div className="h-full flex items-center justify-center text-xs font-mono text-slate-500">
                A monitorizar tráfego de rede...
              </div>
            ) : (
              <svg className="w-full h-full overflow-visible" viewBox="0 0 500 150" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="proRxGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {[0, 37.5, 75, 112.5, 150].map((y, idx) => (
                  <line 
                    key={idx} 
                    x1="0" 
                    y1={y} 
                    x2="500" 
                    y2={y} 
                    stroke="#1E293B" 
                    strokeDasharray="4 4" 
                    strokeWidth="1" 
                  />
                ))}

                {(() => {
                  const maxRate = Math.max(
                    10,
                    ...history.map(h => Math.max(h.netRxKbps, h.netTxKbps))
                  );

                  const rxPoints = history.map((pt, index) => {
                    const x = (index / (history.length - 1)) * 500;
                    const y = 150 - (Math.min(pt.netRxKbps, maxRate) / maxRate) * 140;
                    return `${x},${y}`;
                  }).join(' ');

                  const txPoints = history.map((pt, index) => {
                    const x = (index / (history.length - 1)) * 500;
                    const y = 150 - (Math.min(pt.netTxKbps, maxRate) / maxRate) * 140;
                    return `${x},${y}`;
                  }).join(' ');

                  const areaPoints = `0,150 ${rxPoints} 500,150`;

                  return (
                    <>
                      <polygon points={areaPoints} fill="url(#proRxGradient)" />
                      <polyline 
                        points={rxPoints} 
                        fill="none" 
                        stroke="#0EA5E9" 
                        strokeWidth="2.5" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                      />
                      <polyline 
                        points={txPoints} 
                        fill="none" 
                        stroke="#F97316" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeDasharray="3 3"
                      />
                    </>
                  );
                })()}
              </svg>
            )}
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-3 pt-2 border-t border-slate-700/60">
            <span>-60s</span>
            <span className="text-slate-400">Linha Ciano = Download (RX) • Linha Laranja = Upload (TX)</span>
            <span>Agora</span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          5. MODAL DE LOGS PROFISSIONAL (DARK OBSIDIAN TERMINAL / JOURNALCTL)
          ========================================================================= */}
      {logModalService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-850 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Logs de Diagnóstico:</span>
                    <span className="text-sky-400 font-mono">{logModalService.name}</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    <code className="font-mono text-slate-300">journalctl -u {logModalService.name} --no-pager -n 100</code>
                  </p>
                </div>
              </div>

              {/* Botões do Topo */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleReloadLogs}
                  disabled={loadingLogs}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 transition-colors border border-slate-700"
                  title="Atualizar Logs"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingLogs ? 'animate-spin text-sky-400' : ''}`} />
                </button>

                <button
                  onClick={handleCopyLogs}
                  disabled={!filteredLogs.length}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold transition-colors border border-slate-700"
                  title="Copiar logs exibidos"
                >
                  {copiedLogs ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setLogModalService(null)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors border border-slate-700"
                  title="Fechar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Barra de Filtro de Pesquisa */}
            <div className="px-6 py-2.5 bg-slate-850/60 border-b border-slate-800 flex items-center space-x-3">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                placeholder="Filtrar logs por termo (ex: error, failed, listening, bind)..."
                className="bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none w-full font-mono"
              />
              {logSearchQuery && (
                <button
                  onClick={() => setLogSearchQuery('')}
                  className="text-slate-400 hover:text-white text-xs font-mono"
                >
                  Limpar
                </button>
              )}
            </div>

            {/* Terminal Body */}
            <div className="flex-1 p-5 bg-[#070B13] overflow-y-auto font-mono text-xs select-text">
              {loadingLogs ? (
                <div className="h-64 flex flex-col items-center justify-center text-slate-400 space-y-3">
                  <RefreshCw className="w-7 h-7 animate-spin text-sky-400" />
                  <span className="text-sm">A ler logs do journalctl no servidor...</span>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-slate-500 space-y-2">
                  <span>Nenhum registo encontrado correspondente à pesquisa.</span>
                  {logSearchQuery && (
                    <button
                      onClick={() => setLogSearchQuery('')}
                      className="text-xs text-sky-400 underline"
                    >
                      Remover filtro
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredLogs.map((line, index) => {
                    const isError = /error|failed|failure|crit|panic|emerg/i.test(line);
                    const isWarn = /warning|warn/i.test(line);
                    const isSuccess = /started|listening|ready|active|succeeded/i.test(line);

                    return (
                      <div 
                        key={index} 
                        className={`leading-relaxed whitespace-pre-wrap py-0.5 px-1.5 rounded transition-colors ${
                          isError 
                            ? 'text-rose-400 bg-rose-950/30 border-l-2 border-rose-500' 
                            : isWarn 
                            ? 'text-amber-300 bg-amber-950/20 border-l-2 border-amber-500' 
                            : isSuccess 
                            ? 'text-emerald-300' 
                            : 'text-slate-300'
                        }`}
                      >
                        <span className="text-slate-600 select-none mr-3 inline-block w-8 text-right font-mono">
                          {index + 1}
                        </span>
                        {line}
                      </div>
                    );
                  })}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-850 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>Exibindo {filteredLogs.length} de {serviceLogs.length} linhas</span>
              <button
                onClick={() => setLogModalService(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-bold border border-slate-700 transition-colors"
              >
                Fechar Janela
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
