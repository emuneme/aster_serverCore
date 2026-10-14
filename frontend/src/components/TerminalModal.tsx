import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { 
  X, 
  Terminal as TerminalIcon, 
  Maximize2, 
  Minimize2, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  StopCircle,
  FileText
} from 'lucide-react';
import { api, TaskInfo } from '../services/api';

interface TerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId?: string | null;
  taskTitle?: string;
}

export const TerminalModal: React.FC<TerminalModalProps> = ({
  isOpen,
  onClose,
  taskId,
  taskTitle = 'Terminal de Execução ao Vivo',
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<Terminal | null>(null);
  const fitAddonInstance = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [taskDetails, setTaskDetails] = useState<TaskInfo | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [isMaximized, setIsMaximized] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Initialize xterm
  useEffect(() => {
    if (!isOpen || !terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
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
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermInstance.current = term;
    fitAddonInstance.current = fitAddon;

    term.writeln('\x1b[1;32m═══════════════════════════════════════════════════════════════════\x1b[0m');
    term.writeln('\x1b[1;32m       SGLinux - Terminal de Automação & Streaming ao Vivo         \x1b[0m');
    term.writeln('\x1b[1;32m═══════════════════════════════════════════════════════════════════\x1b[0m\r\n');

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
      fitAddonInstance.current = null;
    };
  }, [isOpen]);

  // Connect WebSocket
  useEffect(() => {
    if (!isOpen) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = taskId 
      ? `${protocol}//${host}/api/tasks/ws/${taskId}`
      : `${protocol}//${host}/api/tasks/ws/stream/terminal`;

    setConnectionStatus('connecting');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'log') {
          if (xtermInstance.current) {
            xtermInstance.current.writeln(msg.data);
          }
        } else if (msg.type === 'status') {
          setTaskDetails((prev) => ({
            ...prev,
            id: msg.task_id,
            command: msg.command || prev?.command || '',
            description: msg.description || prev?.description || '',
            status: msg.status,
            exit_code: msg.exit_code,
            log_file: msg.log_file || prev?.log_file,
            created_at: prev?.created_at || new Date().toISOString(),
            started_at: prev?.started_at || null,
            completed_at: prev?.completed_at || null,
            logs: prev?.logs || [],
          }));
        }
      } catch {
        // Plain text fallback
        if (xtermInstance.current) {
          xtermInstance.current.writeln(event.data);
        }
      }
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
    };

    ws.onerror = () => {
      setConnectionStatus('disconnected');
    };

    // If taskId is provided, fetch initial task info
    if (taskId) {
      api.getTask(taskId)
        .then(setTaskDetails)
        .catch(() => {});
    }

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [isOpen, taskId]);

  const handleCancelTask = async () => {
    if (!taskId) return;
    setCancelling(true);
    try {
      await api.cancelTask(taskId);
    } catch (e: any) {
      alert(`Falha ao cancelar: ${e.message}`);
    } finally {
      setCancelling(false);
    }
  };

  const handleClear = () => {
    xtermInstance.current?.clear();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className={`flex flex-col bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden transition-all duration-200 ${
          isMaximized ? 'w-full h-full m-0 rounded-none' : 'w-full max-w-5xl h-[80vh]'
        }`}
      >
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-850 border-b border-slate-700/70 select-none">
          <div className="flex items-center space-x-3">
            <div className="flex space-x-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-500/80" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
            </div>

            <div className="h-4 w-[1px] bg-slate-700 mx-1" />

            <div className="flex items-center space-x-2 text-slate-200 font-medium text-sm">
              <TerminalIcon className="w-4 h-4 text-emerald-400" />
              <span>{taskDetails?.description || taskTitle}</span>
              {taskId && (
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  ID: {taskId}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Status Indicator */}
            {taskDetails?.status === 'running' && (
              <span className="inline-flex items-center text-xs font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 rounded-full animate-pulse">
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Em execução
              </span>
            )}
            {taskDetails?.status === 'completed' && (
              <span className="inline-flex items-center text-xs font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 rounded-full">
                <CheckCircle2 className="w-3 h-3 mr-1.5" /> Sucesso (0)
              </span>
            )}
            {taskDetails?.status === 'failed' && (
              <span className="inline-flex items-center text-xs font-medium text-rose-400 bg-rose-950/60 border border-rose-800/80 px-2.5 py-1 rounded-full">
                <AlertCircle className="w-3 h-3 mr-1.5" /> Falha ({taskDetails.exit_code ?? '!'})
              </span>
            )}
            {taskDetails?.status === 'cancelled' && (
              <span className="inline-flex items-center text-xs font-medium text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2.5 py-1 rounded-full">
                <StopCircle className="w-3 h-3 mr-1.5" /> Cancelado
              </span>
            )}

            {/* Abort button if running */}
            {taskDetails?.status === 'running' && (
              <button
                onClick={handleCancelTask}
                disabled={cancelling}
                className="px-2.5 py-1 text-xs font-medium text-rose-300 hover:text-white bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 rounded transition-colors flex items-center"
                title="Interromper processo"
              >
                <StopCircle className="w-3.5 h-3.5 mr-1" />
                Interromper
              </button>
            )}

            {/* Clear logs */}
            <button
              onClick={handleClear}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              title="Limpar ecrã"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Maximize */}
            <button
              onClick={() => {
                setIsMaximized(!isMaximized);
                setTimeout(() => fitAddonInstance.current?.fit(), 150);
              }}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              title={isMaximized ? 'Restaurar' : 'Maximizar'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Command info line */}
        {taskDetails?.command && (
          <div className="px-4 py-1.5 bg-slate-950 border-b border-slate-800 text-xs font-mono text-slate-400 flex items-center space-x-2 truncate">
            <span className="text-emerald-500 font-bold">$</span>
            <span className="truncate">{taskDetails.command}</span>
          </div>
        )}

        {/* Terminal Body */}
        <div className="flex-1 p-3 bg-[#0b0f17] overflow-hidden relative">
          <div ref={terminalRef} className="w-full h-full" />
        </div>

        {/* Footer info */}
        <div className="px-4 py-1.5 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-500 flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center space-x-2">
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-500'
                  : connectionStatus === 'connecting'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-rose-500'
              }`}
            />
            <span>
              {connectionStatus === 'connected'
                ? 'WebSocket conectado'
                : connectionStatus === 'connecting'
                ? 'Conectando ao stream...'
                : 'Desconectado'}
            </span>
          </div>

          {taskDetails?.log_file && (
            <div className="flex items-center space-x-1 font-mono text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700 truncate max-w-md">
              <FileText className="w-3 h-3 text-sky-400 shrink-0" />
              <span className="truncate">Log: {taskDetails.log_file}</span>
            </div>
          )}

          <span className="font-mono text-[10px]">xterm.js + WebSockets • SGLinux</span>
        </div>
      </div>
    </div>
  );
};
