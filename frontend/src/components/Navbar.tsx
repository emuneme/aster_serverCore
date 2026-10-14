import React from 'react';
import { 
  Terminal as TerminalIcon, 
  Cpu, 
  HardDrive, 
  ShieldCheck, 
  AlertTriangle,
  Activity,
  LogOut,
  UserCheck
} from 'lucide-react';
import { SystemInfo, UserInfo } from '../services/api';
import { AsterLogo } from './AsterLogo';

interface NavbarProps {
  systemInfo: SystemInfo | null;
  onOpenTerminal: () => void;
  activeTasksCount: number;
  currentUser?: UserInfo | null;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  systemInfo,
  onOpenTerminal,
  activeTasksCount,
  currentUser,
  onLogout,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 shadow-md shadow-slate-950/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Oficial ASTER ServerCore */}
        <div className="flex items-center">
          <AsterLogo variant="full" size="sm" showSlogan={true} />
        </div>

        {/* Right side stats & buttons */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          {/* Environment Mode Badge */}
          {systemInfo?.simulation_mode ? (
            <div className="flex items-center text-xs px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
              <span className="font-medium">Modo Simulação</span>
            </div>
          ) : (
            <div className="flex items-center text-xs px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
              <span className="font-medium">Ubuntu Produção</span>
            </div>
          )}

          {/* Quick CPU / RAM Pill */}
          {systemInfo && (
            <div className="hidden md:flex items-center space-x-3 text-xs bg-slate-850 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300 font-mono">
              <div className="flex items-center space-x-1.5">
                <Cpu className="w-3.5 h-3.5 text-sky-400" />
                <span>CPU: {systemInfo.cpu.usage_percent}%</span>
              </div>
              <span className="text-slate-600">|</span>
              <div className="flex items-center space-x-1.5">
                <HardDrive className="w-3.5 h-3.5 text-purple-400" />
                <span>RAM: {systemInfo.memory.usage_percent}%</span>
              </div>
            </div>
          )}

          {/* Active tasks pill */}
          {activeTasksCount > 0 && (
            <button
              onClick={onOpenTerminal}
              className="flex items-center text-xs font-medium px-2.5 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-700/80 text-emerald-300 animate-pulse"
            >
              <Activity className="w-3.5 h-3.5 mr-1.5 text-emerald-400 animate-spin" />
              <span>{activeTasksCount} em execução</span>
            </button>
          )}

          {/* Live Terminal Button */}
          <button
            onClick={onOpenTerminal}
            className="flex items-center space-x-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors shadow-sm"
          >
            <TerminalIcon className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Terminal xterm</span>
          </button>

          {/* User Profile & Logout */}
          {currentUser && (
            <div className="flex items-center space-x-2 pl-2 border-l border-slate-800">
              <div className="hidden lg:flex flex-col items-end text-right">
                <span className="text-xs font-semibold text-white flex items-center space-x-1">
                  <UserCheck className="w-3.5 h-3.5 text-sky-400" />
                  <span>{currentUser.display_name}</span>
                </span>
                <span className="text-[10px] text-slate-400 uppercase font-mono">
                  {currentUser.auth_type === 'pam' ? 'Ubuntu PAM' : 'Admin Local'}
                </span>
              </div>

              {onLogout && (
                <button
                  onClick={onLogout}
                  title="Terminar sessão de utilizador"
                  className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-medium transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-400" />
                  <span className="hidden sm:inline">Sair</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

