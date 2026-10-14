import React, { useEffect, useState } from 'react';
import { 
  Users, 
  ShieldCheck, 
  Play, 
  RotateCw, 
  Square, 
  Eye, 
  Check, 
  X, 
  AlertCircle,
  Key,
  Server
} from 'lucide-react';
import { api, SambaStatus, SambaPreflightResponse } from '../services/api';
import { AlertTriangle } from 'lucide-react';

interface SambaProvisionProps {
  onOpenTerminalForTask: (taskId: string, title?: string) => void;
}

export const SambaProvision: React.FC<SambaProvisionProps> = ({ onOpenTerminalForTask }) => {
  const [status, setStatus] = useState<SambaStatus | null>(null);
  const [preflight, setPreflight] = useState<SambaPreflightResponse | null>(null);
  const [_loading, setLoading] = useState(true);

  // Form states
  const [realm, setRealm] = useState('CORP.LOCAL');
  const [domain, setDomain] = useState('CORP');
  const [adminPassword, setAdminPassword] = useState('Admin@Samba2026!');
  const [dnsBackend, setDnsBackend] = useState<'SAMBA_INTERNAL' | 'BIND9_DLZ'>('SAMBA_INTERNAL');
  const [dnsForwarder, setDnsForwarder] = useState('8.8.8.8');
  const [forceProvision, setForceProvision] = useState(false);

  const [activeTab, setActiveTab] = useState<'wizard' | 'preview'>('wizard');
  const [smbPreview, setSmbPreview] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const [res, pre] = await Promise.all([
        api.getSambaStatus(),
        api.getSambaPreflight().catch(() => null),
      ]);
      setStatus(res);
      setPreflight(pre);
      if (res.realm) setRealm(res.realm);
      if (res.domain) setDomain(res.domain);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  // Password complexity checks
  const passChecks = {
    length: adminPassword.length >= 8,
    upper: /[A-Z]/.test(adminPassword),
    lower: /[a-z]/.test(adminPassword),
    number: /[0-9]/.test(adminPassword),
    special: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(adminPassword),
  };
  const isPassValid = Object.values(passChecks).every(Boolean);

  // Realm check
  const isRealmValid = realm.includes('.') && realm.trim().length >= 4;

  // Domain check
  const isDomainValid = domain.length >= 1 && domain.length <= 15 && /^[A-Za-z0-9-]+$/.test(domain);

  const canProvision = isPassValid && isRealmValid && isDomainValid;

  const handlePreview = async () => {
    setFeedback(null);
    try {
      const res = await api.previewSamba({
        realm,
        domain,
        admin_password: adminPassword,
        dns_backend: dnsBackend,
        dns_forwarder: dnsForwarder,
      });
      setSmbPreview(res.content);
      setActiveTab('preview');
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const handleProvision = async () => {
    setFeedback(null);
    if (!canProvision) {
      setFeedback({ type: 'error', text: 'Por favor corrija os erros de validação antes de prosseguir.' });
      return;
    }

    if (preflight?.sam_ldb_exists && !forceProvision) {
      setFeedback({
        type: 'error',
        text: 'Estado prévio detetado: sam.ldb já existe. Ative a caixa de confirmação de re-provisionamento forçado para continuar.'
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.provisionSamba({
        realm: realm.toUpperCase(),
        domain: domain.toUpperCase(),
        admin_password: adminPassword,
        dns_backend: dnsBackend,
        dns_forwarder: dnsForwarder,
        force: forceProvision,
      });

      setFeedback({ type: 'success', text: 'Tarefa de provisionamento iniciada!' });
      onOpenTerminalForTask(res.task_id, `Provisionamento Samba 4 AD DC (${res.realm})`);
      loadStatus();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleServiceAction = async (action: string) => {
    try {
      const res = await api.controlSambaService(action);
      onOpenTerminalForTask(res.task_id, `Samba AD DC: ${action}`);
      loadStatus();
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            <span>Samba 4 Active Directory Domain Controller</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Provisionamento automatizado via samba-tool com Kerberos KDC, DNS e Sysvol
          </p>
        </div>

        {/* Service control buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleServiceAction('restart')}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5 text-sky-400" />
            <span>Reiniciar Serviço</span>
          </button>
          <button
            onClick={() => handleServiceAction('stop')}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 rounded-lg transition-colors"
          >
            <Square className="w-3.5 h-3.5 text-rose-400" />
            <span>Parar</span>
          </button>
          <button
            onClick={() => handleServiceAction('start')}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-sm"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Iniciar</span>
          </button>
        </div>
      </div>

      {/* Status banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl">
          <span className="text-xs text-slate-400 block mb-1">Estado de Provisionamento</span>
          <div className="flex items-center space-x-2">
            {status?.is_provisioned ? (
              <span className="flex items-center text-xs font-semibold text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-md border border-emerald-800">
                <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Provisionado
              </span>
            ) : (
              <span className="flex items-center text-xs font-semibold text-amber-400 bg-amber-950/80 px-2.5 py-1 rounded-md border border-amber-800">
                <AlertCircle className="w-3.5 h-3.5 mr-1" /> Não Provisionado
              </span>
            )}
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl">
          <span className="text-xs text-slate-400 block mb-1">Realm Kerberos (FQDN)</span>
          <span className="font-mono text-sm font-semibold text-white">
            {status?.realm || realm}
          </span>
        </div>

        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl">
          <span className="text-xs text-slate-400 block mb-1">Domínio NetBIOS</span>
          <span className="font-mono text-sm font-semibold text-white">
            {status?.domain || domain}
          </span>
        </div>

        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl">
          <span className="text-xs text-slate-400 block mb-1">Backend DNS</span>
          <span className="font-mono text-sm font-semibold text-sky-400">
            {status?.dns_backend || dnsBackend}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-4 text-xs font-medium">
        <button
          onClick={() => setActiveTab('wizard')}
          className={`pb-2 transition-colors border-b-2 flex items-center space-x-1.5 ${
            activeTab === 'wizard'
              ? 'border-sky-500 text-sky-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>Assistente de Provisionamento</span>
        </button>

        <button
          onClick={handlePreview}
          className={`pb-2 transition-colors border-b-2 flex items-center space-x-1.5 ${
            activeTab === 'preview'
              ? 'border-sky-500 text-sky-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Prévia smb.conf (Jinja2)</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-lg text-xs flex items-center space-x-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
              : 'bg-rose-950/60 border border-rose-800 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <Check className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Wizard Form */}
      {activeTab === 'wizard' && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-sm space-y-6">
          {/* Preflight State Warning if sam.ldb exists */}
          {preflight?.sam_ldb_exists && (
            <div className="p-4 bg-amber-950/60 border border-amber-800/80 rounded-xl space-y-2">
              <div className="flex items-center space-x-2 text-amber-300 font-semibold text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Estado Prévio Detetado: Base de dados sam.ldb já existente</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Foi detetado o ficheiro <code className="text-amber-300 font-mono bg-black/40 px-1 py-0.5 rounded">{preflight.sam_ldb_path}</code>. 
                Provisionar novamente sem a opção de sobrescrita forçada é bloqueado para proteger a integridade do domínio.
              </p>
              <label className="flex items-center space-x-2 text-xs text-amber-200 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={forceProvision}
                  onChange={(e) => setForceProvision(e.target.checked)}
                  className="rounded border-amber-700 text-amber-600 focus:ring-amber-500"
                />
                <span className="font-medium">Autorizar re-provisionamento forçado (sobrescrever estado prévio)</span>
              </label>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Domain & Realm */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Active Directory Realm (FQDN)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={realm}
                    onChange={(e) => setRealm(e.target.value.toUpperCase())}
                    placeholder="Ex: CORP.LOCAL ou EMPRESA.LAN"
                    className={`w-full bg-slate-950 border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none ${
                      isRealmValid ? 'border-slate-700 focus:border-emerald-500' : 'border-rose-500'
                    }`}
                  />
                  {isRealmValid ? (
                    <Check className="w-4 h-4 text-emerald-400 absolute right-3 top-2.5" />
                  ) : (
                    <X className="w-4 h-4 text-rose-400 absolute right-3 top-2.5" />
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Deve conter pelo menos um ponto (ex: CORP.LOCAL).
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nome NetBIOS do Domínio (Workgroup)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={domain}
                    maxLength={15}
                    onChange={(e) => setDomain(e.target.value.toUpperCase())}
                    placeholder="Ex: CORP"
                    className={`w-full bg-slate-950 border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none ${
                      isDomainValid ? 'border-slate-700 focus:border-emerald-500' : 'border-rose-500'
                    }`}
                  />
                  <span className="text-[10px] font-mono text-slate-500 absolute right-3 top-2.5">
                    {domain.length}/15
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Máximo de 15 caracteres alfanuméricos sem espaços ou pontos.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Servidor DNS Forwarder IPv4
                </label>
                <input
                  type="text"
                  value={dnsForwarder}
                  onChange={(e) => setDnsForwarder(e.target.value)}
                  placeholder="Ex: 8.8.8.8 ou 1.1.1.1"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Backend de DNS
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div
                    onClick={() => setDnsBackend('SAMBA_INTERNAL')}
                    className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                      dnsBackend === 'SAMBA_INTERNAL'
                        ? 'bg-emerald-950/40 border-emerald-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-semibold text-emerald-400 mb-1">SAMBA_INTERNAL</div>
                    <p className="text-[11px] text-slate-400">DNS embutido no Samba 4. Recomendado para a maioria das instalações.</p>
                  </div>

                  <div
                    onClick={() => setDnsBackend('BIND9_DLZ')}
                    className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                      dnsBackend === 'BIND9_DLZ'
                        ? 'bg-emerald-950/40 border-emerald-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-semibold text-sky-400 mb-1">BIND9_DLZ</div>
                    <p className="text-[11px] text-slate-400">Integração avançada com BIND9 via módulo dinâmico LDB DLZ.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Administrator Password Complexity */}
            <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl space-y-4">
              <div className="flex items-center space-x-2 text-white font-semibold text-sm">
                <Key className="w-4 h-4 text-emerald-400" />
                <span>Senha do Administrador do Domínio</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Senha de Administrador (Administrator)
                </label>
                <input
                  type="text"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                  Requisitos de Complexidade Samba AD:
                </span>
                <div className="space-y-1.5 text-xs font-mono">
                  <div className={`flex items-center space-x-2 ${passChecks.length ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {passChecks.length ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    <span>Pelo menos 8 caracteres</span>
                  </div>
                  <div className={`flex items-center space-x-2 ${passChecks.upper ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {passChecks.upper ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    <span>Letra maiúscula (A-Z)</span>
                  </div>
                  <div className={`flex items-center space-x-2 ${passChecks.lower ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {passChecks.lower ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    <span>Letra minúscula (a-z)</span>
                  </div>
                  <div className={`flex items-center space-x-2 ${passChecks.number ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {passChecks.number ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    <span>Dígito numérico (0-9)</span>
                  </div>
                  <div className={`flex items-center space-x-2 ${passChecks.special ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {passChecks.special ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    <span>Caractere especial (!@#$%^&*...)</span>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 leading-relaxed">
                Ao clicar em provisionar, o comando <code>samba-tool domain provision</code> será disparado em segundo plano e transmitirá os logs em tempo real para o terminal xterm.
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-4 border-t border-slate-700 flex items-center space-x-3">
            <button
              onClick={handleProvision}
              disabled={!canProvision || submitting}
              className={`flex items-center space-x-2 px-5 py-2.5 text-xs font-semibold rounded-lg text-white transition-all shadow-md ${
                canProvision && !submitting
                  ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-950/40 cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Provisionar Samba 4 AD DC</span>
            </button>

            <button
              onClick={handlePreview}
              className="flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              <Eye className="w-4 h-4 text-sky-400" />
              <span>Pré-visualizar smb.conf</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab: Preview smb.conf */}
      {activeTab === 'preview' && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Prévia do Arquivo smb.conf Renderizado</h3>
            <button
              onClick={handleProvision}
              disabled={!canProvision || submitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-all shadow-md"
            >
              Iniciar Provisionamento
            </button>
          </div>
          <pre className="p-4 bg-slate-950 border border-slate-700 rounded-lg font-mono text-xs text-sky-300 overflow-x-auto">
            {smbPreview || 'Nenhuma prévia carregada. Clique em "Pré-visualizar smb.conf".'}
          </pre>
        </div>
      )}
    </div>
  );
};
