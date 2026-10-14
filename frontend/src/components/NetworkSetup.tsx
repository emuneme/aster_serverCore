import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { 
  Network, 
  Globe, 
  Terminal as TerminalIcon, 
  Play, 
  RotateCcw, 
  Plus, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Copy, 
  Check, 
  ShieldCheck, 
  FileText
} from 'lucide-react';
import { api, NetworkInterface } from '../services/api';

interface NetworkSetupProps {
  onSuccess?: () => void;
}

export const NetworkSetup: React.FC<NetworkSetupProps> = ({ onSuccess }) => {
  // 1. Interfaces state (from GET /api/network/interfaces)
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [loadingInterfaces, setLoadingInterfaces] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // 2. Form fields
  const [selectedInterface, setSelectedInterface] = useState<string>('');
  const [address, setAddress] = useState<string>('192.168.1.10/24');
  const [gateway, setGateway] = useState<string>('192.168.1.1');
  const [dnsList, setDnsList] = useState<string[]>(['127.0.0.1']);
  const [newDnsInput, setNewDnsInput] = useState<string>('');
  const [dnsError, setDnsError] = useState<string | null>(null);

  // 3. Execution & WebSocket state
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [executionState, setExecutionState] = useState<'idle' | 'connecting' | 'running' | 'success' | 'error'>('idle');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [logFile, setLogFile] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [copiedLog, setCopiedLog] = useState<boolean>(false);

  // Terminal refs
  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const xtermInstance = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // 1. Ao carregar, faz GET em '/api/network/interfaces' e preenche um dropdown com as placas disponíveis.
  const fetchInterfaces = async () => {
    setLoadingInterfaces(true);
    setFetchError(null);
    try {
      const data = await api.getInterfaces();
      setInterfaces(data);
      if (data.length > 0) {
        // Escolhe a primeira placa física/ativa preferencialmente
        const active = data.find((i) => i.is_up && i.name !== 'lo') || data[0];
        setSelectedInterface(active.name);

        // Se a interface tiver IP pré-existente, sugere como ponto de partida
        if (active.ipv4 && active.ipv4.length > 0) {
          const firstIp = active.ipv4[0].address;
          if (firstIp && !firstIp.startsWith('127.')) {
            // Se o usuário ainda estiver com o default
            setAddress(`${firstIp}/24`);
          }
        }
      }
    } catch (err: any) {
      setFetchError(err.message || 'Falha ao carregar interfaces de rede.');
    } finally {
      setLoadingInterfaces(false);
    }
  };

  useEffect(() => {
    fetchInterfaces();
  }, []);

  // Inicializa o xterm.js no container
  useEffect(() => {
    if (!terminalContainerRef.current) return;

    if (!xtermInstance.current) {
      const term = new Terminal({
        cursorBlink: true,
        fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.25,
        theme: {
          background: '#0b0f17',
          foreground: '#e2e8f0',
          cursor: '#22c55e',
          selectionBackground: '#1e293b',
          black: '#0f172a',
          red: '#ef4444',
          green: '#22c55e',
          yellow: '#eab308',
          blue: '#3b82f6',
          magenta: '#d946ef',
          cyan: '#06b6d4',
          white: '#f8fafc',
          brightBlack: '#64748b',
          brightRed: '#f87171',
          brightGreen: '#4ade80',
          brightYellow: '#fde047',
          brightBlue: '#60a5fa',
          brightMagenta: '#e879f9',
          brightCyan: '#22d3ee',
          brightWhite: '#ffffff',
        },
        convertEol: true,
        scrollback: 3000,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalContainerRef.current);
      fitAddon.fit();

      xtermInstance.current = term;
      fitAddonRef.current = fitAddon;

      term.writeln('\x1b[1;36m┌──────────────────────────────────────────────────────────────┐\x1b[0m');
      term.writeln('\x1b[1;36m│ SGLinux NetworkSetup — Terminal xterm.js (WebSocket Live)    │\x1b[0m');
      term.writeln('\x1b[1;36m└──────────────────────────────────────────────────────────────┘\x1b[0m');
      term.writeln('\x1b[90mAguardando aplicação de configuração de rede...\x1b[0m\r\n');
    }

    const handleResize = () => {
      try {
        fitAddonRef.current?.fit();
      } catch {}
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Cleanup de WebSocket ao desmontar
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Manipulação de tags DNS
  const handleAddDns = () => {
    setDnsError(null);
    const trimmed = newDnsInput.trim();
    if (!trimmed) return;

    // Validação IPv4 básica
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipv4Regex.test(trimmed)) {
      setDnsError('Endereço IP DNS inválido. Exemplo: 127.0.0.1 ou 8.8.8.8');
      return;
    }

    if (dnsList.includes(trimmed)) {
      setDnsError('Este servidor DNS já foi adicionado à lista.');
      return;
    }

    setDnsList([...dnsList, trimmed]);
    setNewDnsInput('');
  };

  const handleRemoveDns = (indexToRemove: number) => {
    if (dnsList.length === 1) {
      setDnsError('É recomendável manter ao menos 1 servidor DNS configurado.');
    }
    setDnsList(dnsList.filter((_, idx) => idx !== indexToRemove));
  };

  const handleDnsKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddDns();
    }
  };

  // 3. Botão 'Aplicar Configuração' que conecta ao WebSocket '/api/network/ws/apply' e exibe o log de execução no xterm.js.
  const handleApplyConfiguration = () => {
    // Validações locais
    if (!selectedInterface) {
      alert('Selecione uma interface de rede.');
      return;
    }

    if (!address.trim() || !address.includes('/')) {
      alert('Endereço IP com máscara CIDR é obrigatório (ex: 192.168.1.10/24).');
      return;
    }

    if (wsRef.current) {
      wsRef.current.close();
    }

    setIsApplying(true);
    setExecutionState('connecting');
    setStatusMessage('Estabelecendo conexão WebSocket com /api/network/ws/apply...');
    setTaskId(null);
    setLogFile(null);

    const term = xtermInstance.current;
    if (term) {
      term.writeln('');
      term.writeln(`\x1b[1;33m[${new Date().toLocaleTimeString()}] ▶ Conectando ao canal WebSocket /api/network/ws/apply...\x1b[0m`);
      term.writeln(`\x1b[90mPlaca:\x1b[0m ${selectedInterface} | \x1b[90mIP:\x1b[0m ${address} | \x1b[90mGateway:\x1b[0m ${gateway || '(Nenhum)'}`);
      term.writeln(`\x1b[90mServidores DNS:\x1b[0m ${dnsList.join(', ')}`);
      term.writeln('\x1b[90m────────────────────────────────────────────────────────────────\x1b[0m');
    }

    // Monta URL do WebSocket
    const isHttps = window.location.protocol === 'https:';
    const wsProtocol = isHttps ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${wsProtocol}//${host}/api/network/ws/apply`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setExecutionState('running');
        setStatusMessage('Conectado. Enviando parâmetros de rede...');
        if (term) {
          term.writeln('\x1b[1;32m✔ Conexão WebSocket estabelecida com sucesso.\x1b[0m');
        }

        // Envia payload JSON
        const payload = {
          interface: selectedInterface,
          address: address.trim(),
          gateway: gateway.trim() || null,
          nameservers: dnsList.length > 0 ? dnsList : ['127.0.0.1'],
        };
        ws.send(JSON.stringify(payload));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // Trata mensagens de início
          if (msg.type === 'started') {
            setTaskId(msg.task_id);
            if (msg.log_file) setLogFile(msg.log_file);
            setStatusMessage(`Tarefa ${msg.task_id} em execução...`);
            if (term) {
              term.writeln(`\x1b[1;34m[TAREFA ${msg.task_id}]\x1b[0m ${msg.message}`);
              if (msg.log_file) {
                term.writeln(`\x1b[90mLog dedicado: ${msg.log_file}\x1b[0m`);
              }
            }
          }

          // Trata logs transmitidos em tempo real pelo CommandExecutor
          else if (msg.type === 'log') {
            if (term && msg.data) {
              term.writeln(msg.data);
            }
          }

          // Trata atualização de status da tarefa
          else if (msg.type === 'status') {
            if (msg.task_id) setTaskId(msg.task_id);
            if (msg.log_file) setLogFile(msg.log_file);

            if (msg.status === 'completed' || msg.status === 'success') {
              setExecutionState('success');
              setIsApplying(false);
              setStatusMessage('Configuração de rede aplicada com sucesso!');
              if (term) {
                term.writeln('');
                term.writeln('\x1b[1;32m════════════════════════════════════════════════════════════════\x1b[0m');
                term.writeln('\x1b[1;32m✔ [SUCESSO] Configuração Netplan gravada e aplicada com êxito!   \x1b[0m');
                term.writeln('\x1b[1;32m════════════════════════════════════════════════════════════════\x1b[0m');
              }
              onSuccess?.();
            } else if (msg.status === 'failed' || msg.status === 'error') {
              setExecutionState('error');
              setIsApplying(false);
              setStatusMessage(`Falha na aplicação do Netplan (Código de saída: ${msg.exit_code})`);
              if (term) {
                term.writeln('');
                term.writeln('\x1b[1;31m✖ [FALHA] Não foi possível aplicar a configuração do Netplan.\x1b[0m');
              }
            }
          }

          // Trata erros emitidos pelo servidor WebSocket
          else if (msg.type === 'error') {
            setExecutionState('error');
            setIsApplying(false);
            setStatusMessage(`Erro: ${msg.message}`);
            if (term) {
              term.writeln(`\x1b[1;31m✖ [ERRO DO SERVIDOR] ${msg.message}\x1b[0m`);
            }
          }
        } catch {
          // Se for texto plano
          if (term) {
            term.writeln(event.data);
          }
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket Error:', err);
        setExecutionState('error');
        setIsApplying(false);
        setStatusMessage('Erro na comunicação com o WebSocket.');
        if (term) {
          term.writeln('\x1b[1;31m✖ [ERRO] Falha na conexão WebSocket com o servidor.\x1b[0m');
        }
      };

      ws.onclose = (event) => {
        if (isApplying) {
          setIsApplying(false);
        }
        if (term) {
          term.writeln(`\x1b[90m[${new Date().toLocaleTimeString()}] Conexão WebSocket encerrada (Código: ${event.code}).\x1b[0m`);
        }
      };
    } catch (e: any) {
      setIsApplying(false);
      setExecutionState('error');
      setStatusMessage(`Exceção ao conectar: ${e.message}`);
      if (term) {
        term.writeln(`\x1b[1;31m✖ Falha ao inicializar WebSocket: ${e.message}\x1b[0m`);
      }
    }
  };

  const handleClearTerminal = () => {
    if (xtermInstance.current) {
      xtermInstance.current.clear();
      xtermInstance.current.writeln('\x1b[90mTerminal limpo.\x1b[0m\r\n');
    }
  };

  const handleCopyLogs = () => {
    if (!taskId) return;
    api.getTaskLog(taskId)
      .then((content: string) => {
        navigator.clipboard.writeText(content);
        setCopiedLog(true);
        setTimeout(() => setCopiedLog(false), 2500);
      })
      .catch((err: any) => {
        alert(`Erro ao copiar log: ${err.message}`);
      });
  };

  const currentSelectedObj = interfaces.find((i) => i.name === selectedInterface);

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
              <Network className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Assistente de Configuração de Rede
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Netplan / IPv4
                </span>
              </h2>
              <p className="text-sm text-slate-400">
                Configure IP estático, gateway e DNS com aplicação segura e streaming em tempo real via WebSocket.
              </p>
            </div>
          </div>

          <button
            onClick={fetchInterfaces}
            disabled={loadingInterfaces || isApplying}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition"
            title="Recarregar interfaces detectadas"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loadingInterfaces ? 'animate-spin' : ''}`} />
            Atualizar Placas
          </button>
        </div>

        {fetchError && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3 text-red-400 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{fetchError}</span>
          </div>
        )}

        {/* Formulário de Configuração */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Coluna Esquerda: Placa e IP */}
          <div className="space-y-4">
            {/* 1. Interface (select) */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5 flex items-center justify-between">
                <span>1. Interface de Rede</span>
                {currentSelectedObj && (
                  <span className={`text-xs px-2 py-0.5 rounded font-mono ${
                    currentSelectedObj.is_up 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    {currentSelectedObj.is_up ? 'ONLINE (UP)' : 'OFFLINE (DOWN)'}
                    {currentSelectedObj.mac ? ` • ${currentSelectedObj.mac}` : ''}
                  </span>
                )}
              </label>
              
              <div className="relative">
                <select
                  value={selectedInterface}
                  onChange={(e) => setSelectedInterface(e.target.value)}
                  disabled={loadingInterfaces || isApplying}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition disabled:opacity-60"
                >
                  {loadingInterfaces ? (
                    <option value="">Detectando interfaces...</option>
                  ) : interfaces.length === 0 ? (
                    <option value="">Nenhuma interface encontrada</option>
                  ) : (
                    interfaces.map((iface) => (
                      <option key={iface.name} value={iface.name}>
                        {iface.name} — {iface.is_up ? 'Ativa' : 'Inativa'} {iface.ipv4.length > 0 ? `(${iface.ipv4[0].address})` : '(Sem IP)'}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Dispositivo físico ou virtual detectado no Ubuntu Server via Netplan.
              </p>
            </div>

            {/* 2. Endereço IP com máscara (input, ex: 192.168.1.10/24) */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                2. Endereço IP com Máscara CIDR <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={isApplying}
                  placeholder="Ex: 192.168.1.10/24"
                  className="w-full bg-slate-950 border border-slate-700 text-white font-mono rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Obrigatório formato CIDR com a barra de máscara (ex: <code className="text-slate-300">192.168.1.10/24</code> ou <code className="text-slate-300">10.0.0.5/16</code>).
              </p>
            </div>

            {/* 3. Gateway padrão (input opcional, ex: 192.168.1.1) */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                3. Gateway Padrão <span className="text-xs text-slate-500 font-normal">(Opcional)</span>
              </label>
              <input
                type="text"
                value={gateway}
                onChange={(e) => setGateway(e.target.value)}
                disabled={isApplying}
                placeholder="Ex: 192.168.1.1"
                className="w-full bg-slate-950 border border-slate-700 text-white font-mono rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition"
              />
              <p className="text-xs text-slate-400 mt-1">
                Roteador de saída para acesso à internet ou outras sub-redes corporativas.
              </p>
            </div>
          </div>

          {/* Coluna Direita: DNS e Resumo */}
          <div className="space-y-4">
            {/* 4. Servidores DNS (tags/lista de inputs, default: 127.0.0.1) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-slate-300">
                  4. Servidores DNS Recursivos
                </label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (!dnsList.includes('127.0.0.1')) setDnsList([...dnsList, '127.0.0.1']);
                    }}
                    className="text-[11px] px-2 py-0.5 bg-slate-800 text-slate-300 hover:text-white rounded border border-slate-700 transition"
                  >
                    + 127.0.0.1 (Samba)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!dnsList.includes('8.8.8.8')) setDnsList([...dnsList, '8.8.8.8']);
                    }}
                    className="text-[11px] px-2 py-0.5 bg-slate-800 text-slate-300 hover:text-white rounded border border-slate-700 transition"
                  >
                    + 8.8.8.8
                  </button>
                </div>
              </div>

              {/* Tag Container */}
              <div className="bg-slate-950 border border-slate-700 rounded-lg p-2.5 min-h-[58px] flex flex-wrap gap-2 items-center">
                {dnsList.map((dns, idx) => (
                  <span
                    key={`${dns}-${idx}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono bg-blue-500/10 text-blue-300 border border-blue-500/20"
                  >
                    <Globe className="w-3 h-3 text-blue-400" />
                    {dns}
                    <button
                      type="button"
                      onClick={() => handleRemoveDns(idx)}
                      disabled={isApplying}
                      className="text-blue-400 hover:text-red-400 transition"
                      title="Remover este DNS"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                {/* Input para nova tag */}
                <div className="inline-flex items-center gap-1 flex-1 min-w-[140px]">
                  <input
                    type="text"
                    value={newDnsInput}
                    onChange={(e) => setNewDnsInput(e.target.value)}
                    onKeyDown={handleDnsKeyDown}
                    disabled={isApplying}
                    placeholder="Adicionar IP (Enter)..."
                    className="bg-transparent text-white text-xs font-mono outline-none w-full placeholder:text-slate-600"
                  />
                  <button
                    type="button"
                    onClick={handleAddDns}
                    disabled={isApplying || !newDnsInput.trim()}
                    className="p-1 text-slate-400 hover:text-blue-400 disabled:opacity-40 transition"
                    title="Adicionar DNS"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {dnsError && (
                <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {dnsError}
                </p>
              )}

              <p className="text-xs text-slate-400 mt-1">
                Pressione Enter para adicionar. Padrão inicial: <code className="text-slate-300">127.0.0.1</code> (ideal para Samba AD DC ou BIND9).
              </p>
            </div>

            {/* Painel Informativo de Auditoria & Backup */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 text-xs space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                Garantias de Segurança Integradas
              </div>
              <ul className="text-slate-400 space-y-1.5 list-disc pl-4">
                <li>Backup automático em <code className="text-slate-300">/etc/netplan/01-netcfg.yaml.bak-*</code> antes de escrever.</li>
                <li>Execução segura via lista de argumentos com <code className="text-slate-300">asyncio.create_subprocess_exec</code>.</li>
                <li>Log de auditoria em arquivo dedicado: <code className="text-slate-300">/var/log/sysmanager/install_*.log</code>.</li>
              </ul>
            </div>

            {/* Botão de Aplicação */}
            <div className="pt-2">
              <button
                onClick={handleApplyConfiguration}
                disabled={isApplying || !selectedInterface || !address}
                className={`w-full py-3 px-4 rounded-xl font-medium text-sm flex items-center justify-center gap-2 shadow-lg transition ${
                  isApplying
                    ? 'bg-blue-600/50 text-blue-200 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/25 active:scale-[0.99]'
                }`}
              >
                {isApplying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Aplicando Configuração via WebSocket...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Aplicar Configuração</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Terminal xterm.js Embutido com logs de execução */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        {/* Barra de Status do Terminal */}
        <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-slate-800 text-blue-400 rounded-lg">
              <TerminalIcon className="w-4 h-4" />
            </div>
            <div>
              <span className="text-sm font-semibold text-white">
                Terminal xterm.js — Canal WebSocket (/api/network/ws/apply)
              </span>
              {taskId && (
                <span className="ml-2 text-xs font-mono text-slate-400">
                  ID: <span className="text-blue-400">{taskId}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Indicador de Status */}
            {executionState === 'running' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" />
                Executando
              </span>
            )}
            {executionState === 'success' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3" />
                Concluído
              </span>
            )}
            {executionState === 'error' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
                <AlertCircle className="w-3 h-3" />
                Erro
              </span>
            )}

            {/* Ações do Terminal */}
            {taskId && (
              <button
                onClick={handleCopyLogs}
                className="px-2.5 py-1 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition flex items-center gap-1"
                title="Copiar log completo"
              >
                {copiedLog ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedLog ? 'Copiado' : 'Copiar Log'}
              </button>
            )}

            <button
              onClick={handleClearTerminal}
              className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 rounded border border-slate-700 transition"
              title="Limpar tela"
            >
              Limpar
            </button>
          </div>
        </div>

        {/* Informação do Arquivo de Log de Auditoria */}
        {logFile && (
          <div className="bg-slate-950/80 px-4 py-2 border-b border-slate-800/80 text-xs font-mono text-slate-400 flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-blue-400" />
            <span>Arquivo de auditoria salvo em:</span>
            <span className="text-slate-200">{logFile}</span>
          </div>
        )}

        {/* Container do xterm.js */}
        <div 
          ref={terminalContainerRef} 
          className="p-3 bg-[#0b0f17] h-[280px] w-full overflow-hidden" 
        />

        {/* Rodapé com mensagem de status */}
        {statusMessage && (
          <div className="bg-slate-950 px-4 py-2 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span>{statusMessage}</span>
            <span className="text-[11px] text-slate-500">Conexão bidirecional não-bloqueante</span>
          </div>
        )}
      </div>
    </div>
  );
};
