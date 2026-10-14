import React, { useEffect, useState } from 'react';
import { 
  LayoutDashboard, 
  Wand2,
  Network, 
  Users, 
  Globe, 
  Shield, 
  Terminal as TerminalIcon 
} from 'lucide-react';
import { Navbar } from './components/Navbar';
import { TerminalModal } from './components/TerminalModal';
import { Login } from './components/Login';
import { Dashboard } from './pages/Dashboard';
import { SetupWizard } from './pages/SetupWizard';
import { NetworkConfig } from './pages/NetworkConfig';
import { SambaProvision } from './pages/SambaProvision';
import { DhcpConfig } from './pages/DhcpConfig';
import { FirewallRules } from './pages/FirewallRules';
import { api, authStorage, ServiceStatus, SystemInfo, TaskInfo, UserInfo } from './services/api';

export const App: React.FC = () => {
  // Estado de Autenticação
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(() => authStorage.getUser());
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const [currentTab, setCurrentTab] = useState<'dashboard' | 'wizard' | 'network' | 'samba' | 'dhcp' | 'firewall'>('dashboard');
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);

  // Terminal Modal state
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeTaskTitle, setActiveTaskTitle] = useState('Terminal ao Vivo');

  // Validação inicial do Token
  useEffect(() => {
    const token = authStorage.getToken();
    if (!token) {
      setCurrentUser(null);
      setIsCheckingAuth(false);
      return;
    }

    api.getAuthMe()
      .then((user) => {
        setCurrentUser(user);
      })
      .catch(() => {
        authStorage.clearSession();
        setCurrentUser(null);
      })
      .finally(() => {
        setIsCheckingAuth(false);
      });

    // Escuta evento global de sessão expirada
    const handleUnauthorized = () => {
      setCurrentUser(null);
    };
    window.addEventListener('sglinux-unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('sglinux-unauthorized', handleUnauthorized);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignora falha de logout remoto
    } finally {
      authStorage.clearSession();
      setCurrentUser(null);
    }
  };

  const refreshOverview = async () => {
    if (!currentUser) return;
    try {
      const [info, svcs, tsks] = await Promise.all([
        api.getSystemInfo().catch(() => null),
        api.getServices().catch(() => []),
        api.getTasks(15).catch(() => []),
      ]);
      if (info) setSystemInfo(info);
      setServices(svcs);
      setTasks(tsks);
    } catch (e) {
      console.error('Polling error', e);
    }
  };

  useEffect(() => {
    if (currentUser) {
      refreshOverview();
      const interval = setInterval(refreshOverview, 5000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  const handleOpenTerminalForTask = (taskId: string, title?: string) => {
    setActiveTaskId(taskId || null);
    setActiveTaskTitle(title || (taskId ? `Tarefa #${taskId}` : 'Terminal Global'));
    setIsTerminalOpen(true);
  };

  const runningTasksCount = tasks.filter((t: TaskInfo) => t.status === 'running').length;

  // Tela de verificação de autenticação
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex flex-col items-center space-y-3">
          <svg className="animate-spin h-7 w-7 text-indigo-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-xs font-medium">A verificar credenciais do servidor...</span>
        </div>
      </div>
    );
  }

  // Se não estiver autenticado, exibe a tela de Login
  if (!currentUser) {
    return <Login onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-900 text-slate-100">
      <Navbar
        systemInfo={systemInfo}
        onOpenTerminal={() => handleOpenTerminalForTask('', 'Terminal Global ao Vivo')}
        activeTasksCount={runningTasksCount}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main Container with Sidebar Navigation */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col md:flex-row gap-6">
        {/* Navigation Sidebar: bg-slate-800 border-slate-700 */}
        <aside className="w-full md:w-60 shrink-0">
          <nav className="space-y-1 bg-slate-800 border border-slate-700 p-2 rounded-2xl sticky top-20 shadow-lg shadow-slate-950/40">
            <button
              onClick={() => setCurrentTab('dashboard')}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                currentTab === 'dashboard'
                  ? 'bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-950/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Visão Geral</span>
            </button>

            <button
              onClick={() => setCurrentTab('wizard')}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                currentTab === 'wizard'
                  ? 'bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-950/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
              }`}
            >
              <Wand2 className="w-4 h-4 text-orange-400" />
              <span>Setup Wizard</span>
            </button>

            <button
              onClick={() => setCurrentTab('network')}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                currentTab === 'network'
                  ? 'bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-950/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
              }`}
            >
              <Network className="w-4 h-4" />
              <span>Rede & Netplan</span>
            </button>

            <button
              onClick={() => setCurrentTab('samba')}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                currentTab === 'samba'
                  ? 'bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-950/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Samba 4 AD DC</span>
            </button>

            <button
              onClick={() => setCurrentTab('dhcp')}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                currentTab === 'dhcp'
                  ? 'bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-950/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
              }`}
            >
              <Globe className="w-4 h-4" />
              <span>Servidor DHCP</span>
            </button>

            <button
              onClick={() => setCurrentTab('firewall')}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                currentTab === 'firewall'
                  ? 'bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-950/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Firewall UFW</span>
            </button>

            <div className="pt-3 mt-3 border-t border-slate-700">
              <button
                onClick={() => handleOpenTerminalForTask('', 'Terminal Global ao Vivo')}
                className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-mono text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-750 border border-slate-700 transition-colors"
              >
                <TerminalIcon className="w-4 h-4 text-emerald-400" />
                <span>Abrir Terminal</span>
              </button>
            </div>
          </nav>
        </aside>

        {/* Page Content View */}
        <main className="flex-1 min-w-0">
          {currentTab === 'dashboard' && (
            <Dashboard
              systemInfo={systemInfo}
              services={services}
              tasks={tasks}
              onOpenTerminalForTask={handleOpenTerminalForTask}
              onNavigateTab={(tab: any) => setCurrentTab(tab)}
              onRefreshData={refreshOverview}
            />
          )}

          {currentTab === 'wizard' && (
            <SetupWizard
              onNavigateTab={(tab: any) => setCurrentTab(tab)}
              onOpenTerminalForTask={handleOpenTerminalForTask}
            />
          )}

          {currentTab === 'network' && (
            <NetworkConfig onOpenTerminalForTask={handleOpenTerminalForTask} />
          )}

          {currentTab === 'samba' && (
            <SambaProvision onOpenTerminalForTask={handleOpenTerminalForTask} />
          )}

          {currentTab === 'dhcp' && (
            <DhcpConfig onOpenTerminalForTask={handleOpenTerminalForTask} />
          )}

          {currentTab === 'firewall' && (
            <FirewallRules onOpenTerminalForTask={handleOpenTerminalForTask} />
          )}
        </main>
      </div>

      {/* Rodapé Corporativo ASTER */}
      <footer className="border-t border-slate-800 bg-slate-900/90 py-4 px-6 text-center text-xs text-slate-500 font-medium">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2">
          <span>© ASTER - Informática & Serviços | ASTER ServerCore v1.0</span>
          <span className="hidden sm:inline text-slate-700">•</span>
          <span>
            Criado por:{' '}
            <a 
              href="https://aster.co.mz" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sky-400 hover:text-sky-300 font-semibold underline decoration-sky-500/40 hover:decoration-sky-300 transition-colors"
            >
              Eusebio Munene
            </a>
          </span>
        </div>
      </footer>

      {/* Real-time Terminal Modal (xterm.js + WebSocket) */}
      <TerminalModal
        isOpen={isTerminalOpen}
        onClose={() => setIsTerminalOpen(false)}
        taskId={activeTaskId}
        taskTitle={activeTaskTitle}
      />
    </div>
  );
};

export default App;
