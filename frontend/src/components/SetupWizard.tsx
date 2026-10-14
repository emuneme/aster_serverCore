import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import {
  Wand2,
  Network,
  Users,
  Globe,
  Shield,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Play,
  Eye,
  EyeOff,
  Check,
  RefreshCw,
  Terminal as TerminalIcon
} from 'lucide-react';
import { api, NetworkInterface, WizardSetupRequest, WizardSummary } from '../services/api';

interface SetupWizardProps {
  onNavigateTab: (tab: string) => void;
  onOpenTerminalForTask?: (taskId: string, title?: string) => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onNavigateTab }) => {
  // Passos do Wizard (1 a 4)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Interfaces de rede detectadas
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [loadingIfaces, setLoadingIfaces] = useState(false);

  // Passo 1: Formulário de Rede
  const [networkInterface, setNetworkInterface] = useState('');
  const [serverIpCidr, setServerIpCidr] = useState('192.168.1.10/24');
  const [gateway, setGateway] = useState('192.168.1.1');
  const [upstreamDns, setUpstreamDns] = useState('8.8.8.8, 1.1.1.1');

  // Passo 2: Formulário Samba AD
  const [realm, setRealm] = useState('EMPRESA.LOCAL');
  const [domain, setDomain] = useState('EMPRESA');
  const [adminPassword, setAdminPassword] = useState('AdminPass2026!');
  const [showPassword, setShowPassword] = useState(false);

  // Passo 3: Formulário DHCP & Firewall
  const [enableDhcp, setEnableDhcp] = useState(true);
  const [dhcpPoolStart, setDhcpPoolStart] = useState('192.168.1.100');
  const [dhcpPoolEnd, setDhcpPoolEnd] = useState('192.168.1.200');
  const [leaseTime, setLeaseTime] = useState(86400);
  const [enableFirewall, setEnableFirewall] = useState(true);

  // Passo 4: Estado da Execução e WebSocket
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState(0);
  const [executionStepName, setExecutionStepName] = useState('Aguardando início...');
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [executionSummary, setExecutionSummary] = useState<WizardSummary | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);

  // Referências para o xterm.js
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<Terminal | null>(null);
  const fitAddonInstance = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Carregar interfaces no início
  const loadInterfaces = async () => {
    setLoadingIfaces(true);
    try {
      const ifaces = await api.getInterfaces();
      setInterfaces(ifaces);
      if (ifaces.length > 0 && !networkInterface) {
        // Selecionar primeira placa não-loopback
        const defaultIface = ifaces.find((i) => !i.name.startsWith('lo')) || ifaces[0];
        setNetworkInterface(defaultIface.name);

        // Se a interface tiver IP configurado, usar como base
        if (defaultIface.ipv4 && defaultIface.ipv4.length > 0) {
          const ipInfo = defaultIface.ipv4[0];
          setServerIpCidr(`${ipInfo.address}/24`);
          autoSuggestPool(`${ipInfo.address}/24`);
        }
      }
    } catch (e) {
      console.error('Erro ao carregar interfaces:', e);
    } finally {
      setLoadingIfaces(false);
    }
  };

  useEffect(() => {
    loadInterfaces();
  }, []);

  // Auto-sugestão de pools DHCP baseando-se no IP do servidor
  const autoSuggestPool = (cidr: string) => {
    try {
      const ipPart = cidr.split('/')[0].trim();
      const octets = ipPart.split('.');
      if (octets.length === 4) {
        const base = `${octets[0]}.${octets[1]}.${octets[2]}`;
        setDhcpPoolStart(`${base}.100`);
        setDhcpPoolEnd(`${base}.200`);
        if (!gateway) {
          setGateway(`${base}.1`);
        }
      }
    } catch {}
  };

  // Quando o Realm é alterado, auto-sugerir o Domínio NetBIOS
  const handleRealmChange = (val: string) => {
    setRealm(val.toUpperCase());
    const firstPart = val.split('.')[0].trim().toUpperCase();
    if (firstPart) {
      setDomain(firstPart.substring(0, 15));
    }
  };

  // Inicializar o Terminal xterm.js no Passo 4
  useEffect(() => {
    if (currentStep === 4 && terminalContainerRef.current && !xtermInstance.current) {
      const term = new Terminal({
        cursorBlink: true,
        fontFamily: 'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
        fontSize: 12,
        lineHeight: 1.25,
        theme: {
          background: '#090d16',
          foreground: '#e2e8f0',
          cursor: '#38bdf8',
          selectionBackground: '#1e293b',
          black: '#0f172a',
          red: '#f87171',
          green: '#4ade80',
          yellow: '#fbbf24',
          blue: '#60a5fa',
          magenta: '#c084fc',
          cyan: '#38bdf8',
          white: '#f8fafc',
          brightBlack: '#64748b',
          brightRed: '#ef4444',
          brightGreen: '#22c55e',
          brightYellow: '#f59e0b',
          brightBlue: '#3b82f6',
          brightMagenta: '#a855f7',
          brightCyan: '#06b6d4',
          brightWhite: '#ffffff',
        },
        convertEol: true,
        scrollback: 5000,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalContainerRef.current);

      try {
        fitAddon.fit();
      } catch {}

      xtermInstance.current = term;
      fitAddonInstance.current = fitAddon;

      term.writeln('\x1b[1;36m═════════════════════════════════════════════════════════════════════════════\x1b[0m');
      term.writeln('\x1b[1;36m        SGLinux - Console de Orquestração do Setup Wizard                    \x1b[0m');
      term.writeln('\x1b[1;36m═════════════════════════════════════════════════════════════════════════════\x1b[0m');
      term.writeln('\x1b[90mAguardando clique no botão "Iniciar Provisionamento Completo"...\x1b[0m\r\n');

      const handleResize = () => {
        try {
          fitAddon.fit();
        } catch {}
      };
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        term.dispose();
        xtermInstance.current = null;
      };
    }
  }, [currentStep]);

  // Limpeza de WebSocket ao desmontar
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Iniciar Provisionamento Completo via WebSocket
  const handleStartProvisioning = () => {
    if (isExecuting) return;

    setIsExecuting(true);
    setExecutionError(null);
    setExecutionSummary(null);
    setIsCompleted(false);
    setExecutionProgress(0);
    setExecutionStepName('Conectando ao orquestrador...');

    if (xtermInstance.current) {
      xtermInstance.current.clear();
      xtermInstance.current.writeln('\x1b[1;33m[Conectando ao canal de orquestração WebSocket /ws/wizard/execute...]\x1b[0m\r\n');
    }

    // Protocolo e URL WebSocket
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws/wizard/execute`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (xtermInstance.current) {
        xtermInstance.current.writeln('\x1b[1;32m✔ Conexão estabelecida com sucesso. Transmitindo parâmetros...\x1b[0m\r\n');
      }

      // Preparar payload
      const payload: WizardSetupRequest = {
        network_interface: networkInterface,
        server_ip_cidr: serverIpCidr.trim(),
        gateway: gateway.trim() || null,
        upstream_dns: upstreamDns.split(',').map((d) => d.trim()).filter(Boolean),
        realm: realm.trim().toUpperCase(),
        domain: domain.trim().toUpperCase(),
        admin_password: adminPassword,
        enable_dhcp: enableDhcp,
        dhcp_pool_start: enableDhcp ? dhcpPoolStart.trim() : null,
        dhcp_pool_end: enableDhcp ? dhcpPoolEnd.trim() : null,
        lease_time: leaseTime,
        enable_firewall: enableFirewall,
        allow_ssh: true,
      };

      ws.send(JSON.stringify(payload));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        // 1. Log de saída em tempo real
        if (msg.type === 'log') {
          if (xtermInstance.current && msg.data) {
            xtermInstance.current.writeln(msg.data);
          }
        }

        // 2. Progresso de Etapa
        if (msg.type === 'progress') {
          setExecutionProgress(msg.percent ?? 0);
          setExecutionStepName(msg.step_name || `Etapa ${msg.step}/4`);
        }

        // 3. Concluído com Sucesso
        if (msg.type === 'completed') {
          setExecutionProgress(100);
          setIsExecuting(false);
          setIsCompleted(true);
          setExecutionSummary(msg.summary || null);
          setExecutionStepName('Provisionamento Concluído!');
          if (xtermInstance.current) {
            xtermInstance.current.writeln('\r\n\x1b[1;32m✔ PROVISIONAMENTO CONCLUÍDO COM SUCESSO!\x1b[0m');
          }
        }

        // 4. Erro de Execução
        if (msg.type === 'error') {
          setIsExecuting(false);
          setExecutionError(msg.message || 'Erro durante a orquestração');
          if (xtermInstance.current) {
            xtermInstance.current.writeln(`\r\n\x1b[1;31m✘ ERRO: ${msg.message}\x1b[0m`);
          }
        }
      } catch (e) {
        console.error('Erro ao processar mensagem WebSocket:', e);
      }
    };

    ws.onerror = (e) => {
      console.error('Erro de WebSocket:', e);
      setIsExecuting(false);
      setExecutionError('Falha na conexão WebSocket com o servidor.');
      if (xtermInstance.current) {
        xtermInstance.current.writeln('\r\n\x1b[1;31m✘ Erro de conexão com o canal WebSocket.\x1b[0m');
      }
    };

    ws.onclose = () => {
      setIsExecuting(false);
    };
  };

  // Validações simples de navegação entre passos
  const validateStep1 = () => {
    if (!networkInterface) return 'Selecione uma placa de rede.';
    if (!serverIpCidr || !serverIpCidr.includes('/')) return 'Insira um IP válido com máscara CIDR (ex: 192.168.1.10/24).';
    return null;
  };

  const validateStep2 = () => {
    if (!realm || !realm.includes('.')) return 'O Realm deve conter pelo menos um ponto (ex: EMPRESA.LOCAL).';
    if (!domain) return 'O Domínio NetBIOS é obrigatório.';
    if (adminPassword.length < 8) return 'A senha deve ter pelo menos 8 caracteres.';
    return null;
  };

  const validateStep3 = () => {
    if (enableDhcp) {
      if (!dhcpPoolStart) return 'Informe o IP inicial do pool DHCP.';
      if (!dhcpPoolEnd) return 'Informe o IP final do pool DHCP.';
    }
    return null;
  };

  const [stepError, setStepError] = useState<string | null>(null);

  const handleNextStep = () => {
    setStepError(null);
    if (currentStep === 1) {
      const err = validateStep1();
      if (err) return setStepError(err);
      setCurrentStep(2);
    } else if (currentStep === 2) {
      const err = validateStep2();
      if (err) return setStepError(err);
      setCurrentStep(3);
    } else if (currentStep === 3) {
      const err = validateStep3();
      if (err) return setStepError(err);
      setCurrentStep(4);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header do Wizard */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white shadow-lg shadow-indigo-950/50">
              <Wand2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Assistente de Configuração Unificada (Setup Wizard)
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Provisionamento contínuo em sequência: Rede → Samba 4 AD DC → Kea DHCP → Firewall UFW
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-mono text-indigo-400 bg-indigo-950 px-3 py-1.5 rounded-lg border border-indigo-800/60 font-semibold">
              Passo {currentStep} de 4
            </span>
          </div>
        </div>

        {/* Stepper Header Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-6 pt-5 border-t border-slate-800/80">
          {[
            { step: 1, label: '1. Rede & Netplan', icon: Network },
            { step: 2, label: '2. Domínio AD DC', icon: Users },
            { step: 3, label: '3. DHCP & Firewall', icon: Globe },
            { step: 4, label: '4. Resumo & Execução', icon: Shield },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = currentStep === item.step;
            const isDone = currentStep > item.step;

            return (
              <button
                key={item.step}
                type="button"
                onClick={() => {
                  if (!isExecuting) setCurrentStep(item.step as any);
                }}
                disabled={isExecuting}
                className={`flex items-center space-x-2.5 p-3 rounded-xl border text-left transition-all ${
                  isActive
                    ? 'bg-indigo-950/60 border-indigo-500 text-white shadow-md shadow-indigo-950/40'
                    : isDone
                    ? 'bg-slate-950/70 border-emerald-900/60 text-emerald-400'
                    : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:text-slate-300'
                }`}
              >
                <div
                  className={`p-1.5 rounded-lg shrink-0 ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : isDone
                      ? 'bg-emerald-950 border border-emerald-700 text-emerald-400'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {isDone ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold block truncate">{item.label}</span>
                  <span className="text-[10px] text-slate-500 block">
                    {isActive ? 'Em edição' : isDone ? 'Validado' : 'Pendente'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Erro de Validação de Passo */}
      {stepError && (
        <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center space-x-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{stepError}</span>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* PASSO 1: Rede & Netplan */}
      {/* ------------------------------------------------------------------- */}
      {currentStep === 1 && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-base font-semibold text-white flex items-center space-x-2">
              <Network className="w-5 h-5 text-indigo-400" />
              <span>Passo 1: Identidade de Rede e Conectividade IP</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Configure o IP estático definitivo do servidor no Ubuntu Netplan e libere a porta 53 para o serviço DNS.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Interface */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-300">
                  Placa de Rede Primária <span className="text-rose-400">*</span>
                </label>
                <button
                  type="button"
                  onClick={loadInterfaces}
                  disabled={loadingIfaces}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingIfaces ? 'animate-spin' : ''}`} />
                  <span>Detectar</span>
                </button>
              </div>
              <select
                value={networkInterface}
                onChange={(e) => setNetworkInterface(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              >
                <option value="">Selecione a interface...</option>
                {interfaces.map((iface) => (
                  <option key={iface.name} value={iface.name}>
                    {iface.name} — {iface.is_up ? 'Online' : 'Down'}
                    {iface.ipv4 && iface.ipv4.length > 0 ? ` (${iface.ipv4[0].address})` : ' (Sem IP)'}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Interface física conectada ao switch central da rede.
              </span>
            </div>

            {/* Endereço IP com CIDR */}
            <div>
              <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                Endereço IP com Máscara CIDR <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={serverIpCidr}
                onChange={(e) => {
                  setServerIpCidr(e.target.value);
                  autoSuggestPool(e.target.value);
                }}
                placeholder="Ex: 192.168.1.10/24"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                IP fixo onde operarão o Samba AD DC e o Kea DHCP.
              </span>
            </div>

            {/* Gateway */}
            <div>
              <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                Gateway Padrão IPv4
              </label>
              <input
                type="text"
                value={gateway}
                onChange={(e) => setGateway(e.target.value)}
                placeholder="Ex: 192.168.1.1"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Roteador de acesso à Internet (opcional para rede isolada).
              </span>
            </div>

            {/* Upstream DNS */}
            <div>
              <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                Servidores DNS Upstream / Forwarders
              </label>
              <input
                type="text"
                value={upstreamDns}
                onChange={(e) => setUpstreamDns(e.target.value)}
                placeholder="Ex: 8.8.8.8, 1.1.1.1"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Separados por vírgula. Usados pelo Samba AD como forwarders externos.
              </span>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={handleNextStep}
              className="flex items-center space-x-2 px-5 py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-sky-950/40"
            >
              <span>Avançar para Domínio AD</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* PASSO 2: Domínio Samba AD DC */}
      {/* ------------------------------------------------------------------- */}
      {currentStep === 2 && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-base font-semibold text-white flex items-center space-x-2">
              <Users className="w-5 h-5 text-emerald-400" />
              <span>Passo 2: Samba 4 Active Directory Domain Controller</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Defina a estrutura de domínio do Active Directory, Realm Kerberos e credenciais do Administrador.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Realm */}
            <div>
              <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                Realm Kerberos (FQDN) <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={realm}
                onChange={(e) => handleRealmChange(e.target.value)}
                placeholder="Ex: EMPRESA.LOCAL ou CORP.LAN"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono uppercase focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                FQDN do domínio em maiúsculas com ponto (ex: EMPRESA.LOCAL).
              </span>
            </div>

            {/* Domínio NetBIOS */}
            <div>
              <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                Nome NetBIOS do Domínio <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value.toUpperCase().slice(0, 15))}
                placeholder="Ex: EMPRESA"
                maxLength={15}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono uppercase focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Nome curto de autenticação Windows (máx 15 caracteres).
              </span>
            </div>

            {/* Senha do Administrador */}
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                Senha do Administrador do AD (Administrator) <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres com maiúsculas, números e símbolos"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Checklist de Complexidade */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2.5 text-[11px]">
                <span className={adminPassword.length >= 8 ? 'text-emerald-400' : 'text-slate-500'}>
                  {adminPassword.length >= 8 ? '✔' : '○'} Mínimo 8 caracteres
                </span>
                <span className={/[A-Z]/.test(adminPassword) ? 'text-emerald-400' : 'text-slate-500'}>
                  {/[A-Z]/.test(adminPassword) ? '✔' : '○'} Letra Maiúscula (A-Z)
                </span>
                <span className={/[0-9]/.test(adminPassword) ? 'text-emerald-400' : 'text-slate-500'}>
                  {/[0-9]/.test(adminPassword) ? '✔' : '○'} Número (0-9)
                </span>
                <span className={/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(adminPassword) ? 'text-emerald-400' : 'text-slate-500'}>
                  {/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(adminPassword) ? '✔' : '○'} Caractere Especial
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="flex items-center space-x-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-650 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar para Rede</span>
            </button>
            <button
              type="button"
              onClick={handleNextStep}
              className="flex items-center space-x-2 px-5 py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-sky-950/40"
            >
              <span>Avançar para DHCP & Firewall</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* PASSO 3: DHCP & Firewall */}
      {/* ------------------------------------------------------------------- */}
      {currentStep === 3 && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-base font-semibold text-white flex items-center space-x-2">
              <Globe className="w-5 h-5 text-sky-400" />
              <span>Passo 3: Servidor DHCP & Firewall UFW</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Ative a distribuição automática de IPs e garanta a proteção das portas essenciais do servidor.
            </p>
          </div>

          {/* Toggle DHCP */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-white block">Ativar Servidor Kea DHCPv4</span>
                <span className="text-[11px] text-slate-400">
                  Distribui IPs dinamicamente às estações de trabalho e clientes da rede local
                </span>
              </div>
              <input
                type="checkbox"
                checked={enableDhcp}
                onChange={(e) => setEnableDhcp(e.target.checked)}
                className="w-4 h-4 accent-sky-500 cursor-pointer"
              />
            </div>

            {enableDhcp && (
              <div className="pt-3 border-t border-slate-800/80 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">
                      Início do Pool DHCP <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={dhcpPoolStart}
                      onChange={(e) => setDhcpPoolStart(e.target.value)}
                      placeholder="Ex: 192.168.1.100"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">
                      Fim do Pool DHCP <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={dhcpPoolEnd}
                      onChange={(e) => setDhcpPoolEnd(e.target.value)}
                      placeholder="Ex: 192.168.1.200"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">
                      Tempo de Concessão (s)
                    </label>
                    <input
                      type="number"
                      min={300}
                      value={leaseTime}
                      onChange={(e) => setLeaseTime(parseInt(e.target.value, 10) || 86400)}
                      placeholder="86400 (24h)"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-sky-950/40 border border-sky-800/60 text-[11px] text-sky-300">
                  💡 <strong>DNS Automático:</strong> O Kea DHCP distribuirá automaticamente o IP deste servidor (
                  <span className="font-mono">{serverIpCidr.split('/')[0]}</span>) como DNS primário, garantindo
                  que todos os computadores ingressem no domínio AD sem configuração manual.
                </div>
              </div>
            )}
          </div>

          {/* Toggle Firewall */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-white block">Ativar Firewall UFW com Salvaguarda SSH</span>
              <span className="text-[11px] text-slate-400">
                Bloqueia conexões não autorizadas, liberando as portas do AD DC, DNS, DHCP e terminal SSH (22/tcp).
              </span>
            </div>
            <input
              type="checkbox"
              checked={enableFirewall}
              onChange={(e) => setEnableFirewall(e.target.checked)}
              className="w-4 h-4 accent-amber-500 cursor-pointer"
            />
          </div>

          <div className="flex justify-between pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="flex items-center space-x-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-650 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar para Domínio</span>
            </button>
            <button
              type="button"
              onClick={handleNextStep}
              className="flex items-center space-x-2 px-5 py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-sky-950/40"
            >
              <span>Avançar para Resumo & Execução</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* PASSO 4: Resumo & Execução Contínua */}
      {/* ------------------------------------------------------------------- */}
      {currentStep === 4 && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-base font-semibold text-white flex items-center space-x-2">
              <Shield className="w-5 h-5 text-amber-400" />
              <span>Passo 4: Resumo e Execução Contínua do Provisionamento</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Revise todos os parâmetros antes da aplicação sequencial das 4 etapas.
            </p>
          </div>

          {/* Cartões de Resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Rede */}
            <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl">
              <span className="text-[11px] font-medium text-indigo-400 flex items-center space-x-1.5 mb-2">
                <Network className="w-3.5 h-3.5" />
                <span>1. Rede & Netplan</span>
              </span>
              <div className="space-y-1 text-xs">
                <p className="text-slate-400">
                  Interface: <strong className="text-white font-mono">{networkInterface}</strong>
                </p>
                <p className="text-slate-400">
                  IP: <strong className="text-amber-300 font-mono">{serverIpCidr}</strong>
                </p>
                <p className="text-slate-400 truncate">
                  Gateway: <span className="font-mono">{gateway || 'Nenhum'}</span>
                </p>
              </div>
            </div>

            {/* Samba AD */}
            <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl">
              <span className="text-[11px] font-medium text-emerald-400 flex items-center space-x-1.5 mb-2">
                <Users className="w-3.5 h-3.5" />
                <span>2. Samba 4 AD DC</span>
              </span>
              <div className="space-y-1 text-xs">
                <p className="text-slate-400">
                  Realm: <strong className="text-white font-mono">{realm}</strong>
                </p>
                <p className="text-slate-400">
                  Domínio: <strong className="text-emerald-300 font-mono">{domain}</strong>
                </p>
                <p className="text-slate-400">
                  Admin: <span className="text-slate-500 font-mono">••••••••</span>
                </p>
              </div>
            </div>

            {/* DHCP */}
            <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl">
              <span className="text-[11px] font-medium text-sky-400 flex items-center space-x-1.5 mb-2">
                <Globe className="w-3.5 h-3.5" />
                <span>3. Kea DHCPv4</span>
              </span>
              <div className="space-y-1 text-xs">
                <p className="text-slate-400">
                  Estado: <strong className={enableDhcp ? 'text-emerald-400' : 'text-slate-500'}>
                    {enableDhcp ? 'Habilitado' : 'Desativado'}
                  </strong>
                </p>
                {enableDhcp ? (
                  <p className="text-slate-400 truncate">
                    Pool: <span className="font-mono text-[11px]">{dhcpPoolStart} → {dhcpPoolEnd}</span>
                  </p>
                ) : (
                  <p className="text-slate-500 italic">Sem distribuição de IPs</p>
                )}
              </div>
            </div>

            {/* Firewall */}
            <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl">
              <span className="text-[11px] font-medium text-amber-400 flex items-center space-x-1.5 mb-2">
                <Shield className="w-3.5 h-3.5" />
                <span>4. Firewall UFW</span>
              </span>
              <div className="space-y-1 text-xs">
                <p className="text-slate-400">
                  Estado: <strong className={enableFirewall ? 'text-emerald-400' : 'text-slate-500'}>
                    {enableFirewall ? 'Ativo com Regras' : 'Desativado'}
                  </strong>
                </p>
                <p className="text-slate-400">
                  SSH Seguro: <span className="text-emerald-400 font-bold">22/tcp garantido</span>
                </p>
              </div>
            </div>
          </div>

          {/* Barra de Progresso Visual */}
          <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium flex items-center space-x-2">
                {isExecuting && <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />}
                <span>{executionStepName}</span>
              </span>
              <span className="font-mono font-bold text-indigo-400">{executionProgress}%</span>
            </div>
            <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500 h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${executionProgress}%` }}
              />
            </div>
          </div>

          {/* Botão de Ação: Iniciar Provisionamento */}
          {!isCompleted && (
            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                disabled={isExecuting}
                className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar</span>
              </button>

              <button
                type="button"
                onClick={handleStartProvisioning}
                disabled={isExecuting}
                className="flex items-center space-x-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 active:scale-[0.99] text-white font-bold text-xs rounded-xl shadow-lg shadow-orange-950/40 transition-all disabled:opacity-50"
              >
                <Play className={`w-4 h-4 fill-current ${isExecuting ? 'animate-spin' : ''}`} />
                <span>{isExecuting ? 'Executando Orquestração...' : 'Iniciar Provisionamento Completo'}</span>
              </button>
            </div>
          )}

          {/* Terminal xterm.js */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center space-x-1.5 font-medium">
                <TerminalIcon className="w-3.5 h-3.5 text-indigo-400" />
                <span>Saída em Tempo Real (WebSocket /ws/wizard/execute)</span>
              </span>
            </div>
            <div
              ref={terminalContainerRef}
              className="h-72 w-full rounded-xl overflow-hidden border border-slate-800 bg-[#090d16] p-2"
            />
          </div>

          {/* Card de Sucesso Final */}
          {isCompleted && (
            <div className="p-5 rounded-2xl bg-emerald-950/60 border border-emerald-800 text-white space-y-4 animate-fadeIn">
              <div className="flex items-start space-x-3.5">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Servidor Provisionado com Sucesso!</h3>
                  <p className="text-xs text-emerald-200/80 mt-0.5">
                    Todas as 4 etapas da infraestrutura foram executadas e validadas continuamente.
                  </p>
                </div>
              </div>

              {executionSummary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-emerald-800/60 text-xs">
                  <div>
                    <span className="text-[10px] text-emerald-300 block">IP do Servidor</span>
                    <strong className="font-mono">{executionSummary.server_ip}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-300 block">Domínio AD DC</span>
                    <strong className="font-mono">{executionSummary.realm}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-300 block">Kea DHCP</span>
                    <strong className="text-emerald-300 font-semibold">
                      {executionSummary.dhcp_enabled ? 'Ativo' : 'Desativado'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-300 block">Firewall UFW</span>
                    <strong className="text-emerald-300 font-semibold">
                      {executionSummary.firewall_enabled ? 'Ativo e Protegido' : 'Desativado'}
                    </strong>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => onNavigateTab('dashboard')}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-emerald-950/40"
                >
                  Ir para o Painel Geral (Dashboard)
                </button>
              </div>
            </div>
          )}

          {/* Erro Crítico */}
          {executionError && (
            <div className="p-4 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{executionError}</span>
              </div>
              <button
                type="button"
                onClick={handleStartProvisioning}
                className="px-3 py-1.5 bg-rose-900 hover:bg-rose-850 text-white rounded-lg text-xs font-semibold"
              >
                Tentar Novamente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SetupWizard;
