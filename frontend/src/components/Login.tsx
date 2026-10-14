import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  User, 
  KeyRound, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  Terminal, 
  ArrowRight,
  Fingerprint,
  Server,
  Lock,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { api, authStorage, LoginResponse, ServerAuthInfo, UserInfo } from '../services/api';
import { AsterLogo } from './AsterLogo';

interface LoginProps {
  onLoginSuccess: (user: UserInfo) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [authMode, setAuthMode] = useState<'pam' | 'local'>('pam');
  const [capsLockActive, setCapsLockActive] = useState(false);
  
  const [serverInfo, setServerInfo] = useState<ServerAuthInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<'user' | 'pass' | null>(null);

  // Carrega informações públicas do servidor no arranque
  useEffect(() => {
    let isMounted = true;
    api.getAuthStatus()
      .then((info) => {
        if (isMounted) setServerInfo(info);
      })
      .catch(() => {
        if (isMounted) {
          setServerInfo({
            hostname: 'ubuntu-server',
            os_name: 'Ubuntu Server Linux',
            is_production: true,
            server_ip: '127.0.0.1',
            version: '1.0.0',
          });
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleTabChange = (mode: 'pam' | 'local') => {
    setAuthMode(mode);
    setErrorMsg(null);
    if (mode === 'local') {
      setUsername('admin');
      setPassword('SGLinux@Admin2026!');
    } else {
      setUsername('');
      setPassword('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.getModifierState) {
      setCapsLockActive(e.getModifierState('CapsLock'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg('Por favor, preencha o nome de utilizador e a palavra-passe.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const resp: LoginResponse = await api.login({
        username: username.trim(),
        password,
        remember_me: rememberMe,
      });

      // Salva sessão localmente e notifica a aplicação principal
      authStorage.setSession(resp, rememberMe);
      onLoginSuccess(resp.user_info);
    } catch (err: any) {
      setErrorMsg(err.message || 'Credenciais inválidas. Verifique os dados de acesso e tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFillDemoCreds = (user: string, pass: string, mode: 'pam' | 'local') => {
    setAuthMode(mode);
    setUsername(user);
    setPassword(pass);
    setErrorMsg(null);
  };

  return (
    <div 
      className="min-h-screen relative flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-950 text-slate-100 overflow-hidden selection:bg-sky-500 selection:text-white"
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyDown}
    >
      {/* ------------------------------------------------------------------- */}
      {/* BACKGROUND ATMOSFÉRICO, MALHA CIBERNÉTICA & GLOW EFFECTS */}
      {/* ------------------------------------------------------------------- */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Glow Laranja ASTER Superior Esquerdo */}
        <div className="absolute -top-40 -left-40 w-[32rem] h-[32rem] bg-orange-500/12 rounded-full blur-[140px] animate-pulse" />
        
        {/* Glow Ciano Sky Blue Central / Direito */}
        <div className="absolute top-1/4 -right-36 w-[36rem] h-[36rem] bg-sky-500/15 rounded-full blur-[150px]" />
        
        {/* Glow Esmeralda Inferior Esquerdo (Segurança & Uptime) */}
        <div className="absolute -bottom-40 left-1/4 w-[30rem] h-[30rem] bg-emerald-500/10 rounded-full blur-[130px]" />

        {/* Grade de Datacenter com Máscara Radial de Alta Resolução */}
        <div 
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)`,
            backgroundSize: '28px 28px',
            maskImage: 'radial-gradient(ellipse 65% 65% at 50% 50%, #000 60%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 65% 65% at 50% 50%, #000 60%, transparent 100%)',
          }}
        />
        
        {/* Linhas de Feixes de Luz Sutis */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-sky-500/30 to-transparent" />
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* CONTAINER DO CARTÃO PRINCIPAL */}
      {/* ------------------------------------------------------------------- */}
      <div className="relative z-10 w-full max-w-[460px] my-auto">
        {/* Card Principal com Glassmorphism Profundo: bg-slate-900/85 backdrop-blur-2xl */}
        <div className="bg-slate-900/85 backdrop-blur-2xl border border-slate-700/80 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] p-6 sm:p-8 relative overflow-hidden transition-all duration-300 hover:border-slate-600/90 ring-1 ring-white/5">
          
          {/* Top Border Accent com Gradiente Corporativo ASTER (Laranja -> Sky -> Esmeralda) */}
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-orange-500 via-sky-500 to-emerald-400" />

          {/* Cabeçalho do Card com Logo Oficial e Nome de Marca */}
          <div className="text-center space-y-4 mb-6">
            <div className="flex justify-center pt-1">
              <AsterLogo variant="full" size="md" showSlogan={true} className="justify-center" />
            </div>

            {/* Heartbeat Badge com Telemetria em Tempo Real do Servidor */}
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 shadow-inner">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="font-mono text-emerald-400 font-semibold tracking-tight">
                {serverInfo?.hostname || 'ubuntu-server'}
              </span>
              <span className="text-slate-700">|</span>
              <span className="text-slate-400 font-mono text-[10px]">
                {serverInfo?.server_ip ? serverInfo.server_ip : '127.0.0.1'}
              </span>
              <span className="text-slate-700">|</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                serverInfo?.is_production 
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' 
                  : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
              }`}>
                {serverInfo?.is_production ? 'Produção' : 'Simulação'}
              </span>
            </div>
          </div>

          {/* ----------------------------------------------------------------- */}
          {/* SELETOR DE MODO DE AUTENTICAÇÃO HÍBRIDA (SEGMENTED CONTROL) */}
          {/* ----------------------------------------------------------------- */}
          <div className="mb-5">
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950/90 rounded-2xl border border-slate-800/90 shadow-inner">
              <button
                type="button"
                onClick={() => handleTabChange('pam')}
                className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all duration-200 ${
                  authMode === 'pam'
                    ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/60'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Ubuntu (PAM / sudo)</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabChange('local')}
                className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all duration-200 ${
                  authMode === 'local'
                    ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/60'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Admin ServerCore</span>
              </button>
            </div>

            {/* Micro-guia contextual do método selecionado */}
            <div className="mt-2.5 px-2 py-1.5 rounded-lg bg-slate-950/40 border border-slate-800/60 text-[11px] text-slate-400 flex items-center space-x-2">
              <span className="text-sky-400 shrink-0">
                {authMode === 'pam' ? <Server className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
              </span>
              <p className="leading-snug">
                {authMode === 'pam' ? (
                  <>Credenciais nativas do Linux OS (<code className="text-sky-300 font-mono">root</code> ou membros do grupo <code className="text-sky-300 font-mono">sudo</code>).</>
                ) : (
                  <>Acesso administrativo interno protegido (<code className="text-orange-300 font-mono">admin</code> com permissões plenas).</>
                )}
              </p>
            </div>
          </div>

          {/* Alerta de Erro com Animação */}
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start space-x-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block text-rose-200">Falha na Autenticação</span>
                <span className="text-[11px] text-rose-300/90 leading-tight">{errorMsg}</span>
              </div>
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* FORMULÁRIO DE LOGIN */}
          {/* ----------------------------------------------------------------- */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Campo: Nome de Utilizador */}
            <div>
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between mb-1.5">
                <span>Nome de Utilizador</span>
                <span className="text-[10px] text-slate-500 font-normal">
                  {authMode === 'pam' ? 'Conta Linux OS' : 'Conta Interna'}
                </span>
              </label>
              <div className="relative group">
                <div className={`absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none transition-colors duration-200 ${
                  focusedField === 'user' ? 'text-sky-400' : 'text-slate-500'
                }`}>
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onFocus={() => setFocusedField('user')}
                  onBlur={() => setFocusedField(null)}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={authMode === 'pam' ? 'ex: root, ubuntu ou sysadmin' : 'ex: admin'}
                  className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 font-medium focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/25 transition-all shadow-inner"
                />
              </div>
            </div>

            {/* Campo: Palavra-passe */}
            <div>
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between mb-1.5">
                <span>Palavra-passe</span>
                {capsLockActive && (
                  <span className="text-[10px] text-amber-400 font-semibold flex items-center space-x-1 animate-pulse">
                    <span>⚠️ Caps Lock Ativado</span>
                  </span>
                )}
              </label>
              <div className="relative group">
                <div className={`absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none transition-colors duration-200 ${
                  focusedField === 'pass' ? 'text-sky-400' : 'text-slate-500'
                }`}>
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onFocus={() => setFocusedField('pass')}
                  onBlur={() => setFocusedField(null)}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Insira a sua senha"
                  className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-500 font-medium focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/25 transition-all shadow-inner font-mono"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                  title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Checkbox: Manter Sessão Iniciada */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center space-x-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-sky-500 focus:ring-sky-500/30 accent-sky-500 cursor-pointer"
                />
                <span className="text-[11px] text-slate-400 group-hover:text-slate-300 transition-colors select-none">
                  Manter sessão iniciada (30 dias)
                </span>
              </label>

              <span className="text-[10px] text-slate-500 flex items-center space-x-1 font-mono">
                <Fingerprint className="w-3 h-3 text-slate-400" />
                <span>JWT HS256</span>
              </span>
            </div>

            {/* Botão de Submissão com Visual Primário ASTER (Sky) */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 active:scale-[0.99] transition-all shadow-lg shadow-sky-500/25 hover:shadow-sky-500/35 disabled:opacity-50 disabled:cursor-not-allowed mt-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>A validar credenciais...</span>
                </>
              ) : (
                <>
                  <span>Entrar no Painel de Controlo</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          {/* ----------------------------------------------------------------- */}
          {/* ATALHOS RÁPIDOS DE DEMONSTRAÇÃO / PRIMEIRO ACESSO */}
          {/* ----------------------------------------------------------------- */}
          <div className="mt-5 pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-400 flex items-center space-x-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>Credenciais Rápidas de Acesso:</span>
              </span>
              <span className="text-[10px] text-slate-500">1 clique</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleFillDemoCreds('root', 'root', 'pam')}
                className={`text-[11px] text-left p-2.5 rounded-xl border transition-all ${
                  authMode === 'pam' && username === 'root'
                    ? 'bg-slate-800/90 border-orange-500/60 ring-1 ring-orange-500/30'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-orange-400">Ubuntu root</span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-orange-500/10 text-orange-400 font-mono">PAM</span>
                </div>
                <span className="font-mono text-[10px] text-slate-400 block mt-0.5">root / root</span>
              </button>

              <button
                type="button"
                onClick={() => handleFillDemoCreds('admin', 'SGLinux@Admin2026!', 'local')}
                className={`text-[11px] text-left p-2.5 rounded-xl border transition-all ${
                  authMode === 'local' && username === 'admin'
                    ? 'bg-slate-800/90 border-sky-500/60 ring-1 ring-sky-500/30'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sky-400">Admin ASTER</span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-sky-500/10 text-sky-400 font-mono">Local</span>
                </div>
                <span className="font-mono text-[10px] text-slate-400 block mt-0.5">admin / SGLinux@...</span>
              </button>
            </div>
          </div>

          {/* Selos de Segurança e Status do Ambiente */}
          <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500 font-medium">
            <span className="flex items-center space-x-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-400">Ambiente Seguro & Auditado</span>
            </span>
            <span className="font-mono text-slate-400">ASTER ServerCore v1.0</span>
          </div>

        </div>

        {/* Rodapé Corporativo Oficial Externo */}
        <div className="mt-6 text-center text-xs text-slate-500 font-medium tracking-wide flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2">
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
      </div>
    </div>
  );
};
