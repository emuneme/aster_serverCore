import React, { useEffect, useState } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  RefreshCw,
  Power,
  Zap,
  Network,
  Share2,
  X,
  Search,
  Lock,
  Server,
  Info
} from 'lucide-react';
import {
  api,
  UfwStatus,
  FirewallProfileInfo,
  NatStatusResponse,
  NetworkInterface,
  NatConfigRequest
} from '../services/api';

interface FirewallManagerProps {
  onOpenTerminalForTask: (taskId: string, title?: string) => void;
}

export const FirewallManager: React.FC<FirewallManagerProps> = ({ onOpenTerminalForTask }) => {
  // Estado UFW e Regras
  const [status, setStatus] = useState<UfwStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingUfw, setTogglingUfw] = useState(false);

  // Perfis
  const [profiles, setProfiles] = useState<FirewallProfileInfo[]>([]);
  const [applyingProfile, setApplyingProfile] = useState<string | null>(null);

  // NAT / Roteamento
  const [natStatus, setNatStatus] = useState<NatStatusResponse | null>(null);
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [natWan, setNatWan] = useState('');
  const [natLan, setNatLan] = useState('');
  const [natSubnet, setNatSubnet] = useState('');
  const [configuringNat, setConfiguringNat] = useState(false);

  // Modal de Nova Regra
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [ruleAction, setRuleAction] = useState<'allow' | 'deny' | 'reject' | 'limit'>('allow');
  const [ruleDirection, setRuleDirection] = useState<'in' | 'out'>('in');
  const [rulePort, setRulePort] = useState('443');
  const [ruleProtocol, setRuleProtocol] = useState<'tcp' | 'udp' | 'any'>('tcp');
  const [ruleFromIp, setRuleFromIp] = useState('');
  const [ruleComment, setRuleComment] = useState('');
  const [submittingRule, setSubmittingRule] = useState(false);

  // Busca / Filtro de Regras
  const [searchQuery, setSearchQuery] = useState('');

  // Notificações e Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Carregamento de Dados Completo
  const loadAllData = async () => {
    setLoading(true);
    try {
      const [ufwData, profilesData, natData, ifaceData] = await Promise.all([
        api.getUfwStatus().catch((e) => {
          console.error('Erro ao buscar status UFW:', e);
          return null;
        }),
        api.getFirewallProfiles().catch((e) => {
          console.error('Erro ao buscar perfis:', e);
          return [];
        }),
        api.getNatStatus().catch((e) => {
          console.error('Erro ao buscar status NAT:', e);
          return null;
        }),
        api.getInterfaces().catch((e) => {
          console.error('Erro ao buscar interfaces:', e);
          return [];
        }),
      ]);

      if (ufwData) setStatus(ufwData);
      setProfiles(profilesData || []);
      if (natData) {
        setNatStatus(natData);
        if (natData.wan_interface) setNatWan(natData.wan_interface);
        if (natData.lan_interface) setNatLan(natData.lan_interface);
        if (natData.lan_subnet) setNatSubnet(natData.lan_subnet);
      }
      if (ifaceData && ifaceData.length > 0) {
        setInterfaces(ifaceData);
        // Preenchimento inicial inteligente de interfaces WAN/LAN caso não definidas
        if (!natWan && ifaceData.length > 0) {
          const defaultWan = ifaceData.find((i) => i.name.startsWith('eth') || i.name.startsWith('en') || i.name.startsWith('wl')) || ifaceData[0];
          setNatWan(defaultWan.name);
        }
        if (!natLan && ifaceData.length > 1) {
          const secondIface = ifaceData.find((i) => i.name !== natWan) || ifaceData[1];
          setNatLan(secondIface.name);
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: `Erro de comunicação: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Alternar UFW (Ligar/Desligar)
  const handleToggleUfw = async () => {
    setFeedback(null);
    setTogglingUfw(true);
    try {
      const willEnable = !status?.active;
      const res = await api.toggleUfw(willEnable);
      setFeedback({
        type: 'info',
        text: willEnable
          ? 'Ativação do Firewall solicitada (com proteção automática de SSH).'
          : 'Desativação do Firewall solicitada.',
      });
      onOpenTerminalForTask(
        res.task_id,
        willEnable ? 'Ativação Segura do Firewall UFW' : 'Desativação do Firewall UFW'
      );
      setTimeout(loadAllData, 2000);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setTogglingUfw(false);
    }
  };

  // Aplicação de Perfis em 1-Clique
  const handleApplyProfile = async (profileKey: string, profileTitle: string) => {
    setFeedback(null);
    setApplyingProfile(profileKey);
    try {
      const res = await api.applyFirewallProfiles([profileKey]);
      setFeedback({
        type: 'success',
        text: `Perfil '${profileTitle}' submetido com sucesso para liberação no UFW!`,
      });
      onOpenTerminalForTask(res.task_id, `Liberação Perfil de Firewall: ${profileTitle}`);
      setTimeout(loadAllData, 2000);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setApplyingProfile(null);
    }
  };

  // Aplicação em 1-Clique Múltiplo (ex: DHCP + DNS)
  const handleApplyMultiProfiles = async (profileKeys: string[], title: string) => {
    setFeedback(null);
    setApplyingProfile(profileKeys.join('+'));
    try {
      const res = await api.applyFirewallProfiles(profileKeys);
      setFeedback({
        type: 'success',
        text: `Perfis de serviços (${title}) enviados para aplicação no UFW!`,
      });
      onOpenTerminalForTask(res.task_id, `Liberação de Serviços: ${title}`);
      setTimeout(loadAllData, 2000);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setApplyingProfile(null);
    }
  };

  // Exclusão de Regra
  const handleDeleteRule = async (index: number) => {
    if (!window.confirm(`Tem certeza de que deseja remover a regra #${index} do UFW?`)) return;
    setFeedback(null);
    try {
      const res = await api.deleteUfwRule(index);
      setFeedback({ type: 'info', text: `Remoção da regra #${index} enviada.` });
      onOpenTerminalForTask(res.task_id, `Exclusão de Regra UFW #${index}`);
      setTimeout(loadAllData, 2000);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  // Adicionar Nova Regra Manual via Modal
  const handleAddRuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmittingRule(true);
    try {
      const res = await api.addUfwRule({
        action: ruleAction,
        direction: ruleDirection,
        port: rulePort.trim(),
        protocol: ruleProtocol,
        from_ip: ruleFromIp.trim() || null,
        comment: ruleComment.trim() || null,
      });

      setFeedback({
        type: 'success',
        text: `Regra ${ruleAction.toUpperCase()} para porta ${rulePort} adicionada ao firewall.`,
      });
      setIsRuleModalOpen(false);
      onOpenTerminalForTask(
        res.task_id,
        `Adicionar Regra UFW (${ruleAction.toUpperCase()} ${rulePort}/${ruleProtocol})`
      );

      // Limpar formulário
      setRulePort('');
      setRuleComment('');
      setRuleFromIp('');

      setTimeout(loadAllData, 2000);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setSubmittingRule(false);
    }
  };

  // Configurar NAT e Roteamento
  const handleConfigureNat = async (enableNat: boolean) => {
    if (!natWan) {
      setFeedback({ type: 'error', text: 'Selecione a interface de saída (WAN) para o NAT.' });
      return;
    }
    if (!natLan) {
      setFeedback({ type: 'error', text: 'Selecione a interface interna (LAN) para o NAT.' });
      return;
    }
    if (natWan === natLan) {
      setFeedback({ type: 'error', text: 'A interface WAN e LAN não podem ser iguais para NAT.' });
      return;
    }

    setFeedback(null);
    setConfiguringNat(true);
    try {
      const payload: NatConfigRequest = {
        enabled: enableNat,
        wan_interface: natWan,
        lan_interface: natLan,
        lan_subnet: natSubnet.trim() || null,
      };

      const res = await api.configureNat(payload);
      setFeedback({
        type: 'success',
        text: enableNat
          ? `Roteador e NAT ativados com sucesso (WAN: ${natWan}, LAN: ${natLan})!`
          : 'Compartilhamento NAT desativado com sucesso.',
      });
      onOpenTerminalForTask(
        res.task_id,
        enableNat ? 'Configuração de NAT e Masquerade' : 'Desativação de NAT'
      );
      setTimeout(loadAllData, 2000);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setConfiguringNat(false);
    }
  };

  // Regras filtradas
  const filteredRules = (status?.rules || []).filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.to.toLowerCase().includes(q) ||
      r.action.toLowerCase().includes(q) ||
      r.from_ip.toLowerCase().includes(q) ||
      (r.comment && r.comment.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* 1. Header com Status Geral e Switch */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">
                  Firewall UFW & Roteador NAT
                </h1>
                <p className="text-xs text-slate-400">
                  Segurança perimetral do Ubuntu Server, perfis automáticos de serviços e gateway de internet
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Status Visual Badge */}
            <div
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                status?.active
                  ? 'bg-emerald-950/80 border-emerald-700/60 text-emerald-300 shadow-lg shadow-emerald-950/40'
                  : 'bg-rose-950/80 border-rose-700/60 text-rose-300 shadow-lg shadow-rose-950/40'
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  status?.active ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                }`}
              />
              <span>{status?.active ? 'FIREWALL ATIVO' : 'FIREWALL DESATIVADO'}</span>
            </div>

            {/* Switch Toggle para Ativar/Desativar */}
            <button
              onClick={handleToggleUfw}
              disabled={togglingUfw || loading}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-md ${
                status?.active
                  ? 'bg-rose-900/60 hover:bg-rose-800 border border-rose-700 text-rose-200'
                  : 'bg-orange-500 hover:bg-orange-600 text-white border border-orange-400'
              } disabled:opacity-50`}
            >
              <Power className={`w-3.5 h-3.5 ${togglingUfw ? 'animate-spin' : ''}`} />
              <span>{status?.active ? 'Desativar UFW' : 'Ativar UFW (Seguro)'}</span>
            </button>

            {/* Recarregar */}
            <button
              onClick={loadAllData}
              disabled={loading}
              className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-xl transition-colors"
              title="Recarregar status do firewall"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mt-4 p-3.5 rounded-xl text-xs flex items-center space-x-3 border ${
              feedback.type === 'success'
                ? 'bg-emerald-950/50 border-emerald-800 text-emerald-200'
                : feedback.type === 'error'
                ? 'bg-rose-950/50 border-rose-800 text-rose-200'
                : 'bg-indigo-950/50 border-indigo-800 text-indigo-200'
            }`}
          >
            {feedback.type === 'success' && <Check className="w-4 h-4 shrink-0 text-emerald-400" />}
            {feedback.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />}
            {feedback.type === 'info' && <Info className="w-4 h-4 shrink-0 text-indigo-400" />}
            <span className="flex-1 font-medium">{feedback.text}</span>
            <button
              onClick={() => setFeedback(null)}
              className="p-1 hover:bg-slate-800/60 rounded text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Status Indicators Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mt-5 pt-5 border-t border-slate-800/80">
          <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-xl">
            <span className="text-[11px] font-medium text-slate-400 block mb-1">Proteção Perimetral</span>
            <div className="flex items-center space-x-1.5 text-xs font-semibold">
              {status?.active ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Ativa e Bloqueando</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span className="text-rose-400">Desprotegido</span>
                </>
              )}
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-xl">
            <span className="text-[11px] font-medium text-slate-400 block mb-1">Política Padrão Entrada</span>
            <span className="font-mono text-xs font-bold text-rose-400 uppercase">
              {status?.default_incoming || 'DENY (BLOQUEAR)'}
            </span>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-xl">
            <span className="text-[11px] font-medium text-slate-400 block mb-1">Política Padrão Saída</span>
            <span className="font-mono text-xs font-bold text-emerald-400 uppercase">
              {status?.default_outgoing || 'ALLOW (PERMITIR)'}
            </span>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-xl">
            <span className="text-[11px] font-medium text-slate-400 block mb-1">Gateway NAT / Masquerade</span>
            <div className="flex items-center space-x-1.5 text-xs font-semibold">
              {natStatus?.enabled ? (
                <>
                  <Share2 className="w-4 h-4 text-sky-400" />
                  <span className="text-sky-400">Ativo ({natStatus.lan_interface} → {natStatus.wan_interface})</span>
                </>
              ) : (
                <>
                  <Network className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-400">Desativado</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Botões de Ação Rápida em 1-Clique (Perfis) */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center space-x-2">
              <Zap className="w-4 h-4 text-orange-400" />
              <span>Perfis de Serviços em 1-Clique</span>
            </h2>
            <p className="text-xs text-slate-400">
              Libere automaticamente todos os protocolos necessários para cada serviço de infraestrutura
            </p>
          </div>
        </div>

        {/* 1-Clique Botões Principais */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Garantir Acesso SSH */}
          <button
            onClick={() => handleApplyProfile('ssh', 'Garantir Acesso SSH')}
            disabled={applyingProfile !== null}
            className="flex items-start space-x-3 p-3.5 bg-slate-950/70 hover:bg-slate-850/80 border border-slate-800 hover:border-slate-700 rounded-xl transition-all text-left group disabled:opacity-50"
          >
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 group-hover:scale-105 transition-transform shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Garantir Acesso SSH</span>
                <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950 px-1.5 py-0.5 rounded border border-indigo-800/60">
                  22/tcp
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Libera o terminal remoto e previne bloqueio acidental.
              </p>
            </div>
          </button>

          {/* Liberar Samba 4 AD DC */}
          <button
            onClick={() => handleApplyProfile('samba_ad', 'Samba 4 AD DC')}
            disabled={applyingProfile !== null}
            className="flex items-start space-x-3 p-3.5 bg-slate-950/70 hover:bg-slate-850/80 border border-slate-800 hover:border-slate-700 rounded-xl transition-all text-left group disabled:opacity-50"
          >
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:scale-105 transition-transform shrink-0">
              <Server className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Liberar Samba AD</span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800/60">
                  17 Portas
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Libera Kerberos, LDAP, SMB, RPC e portas de catálogo AD.
              </p>
            </div>
          </button>

          {/* Liberar DHCP & DNS */}
          <button
            onClick={() => handleApplyMultiProfiles(['dhcp', 'dns'], 'DHCP & DNS')}
            disabled={applyingProfile !== null}
            className="flex items-start space-x-3 p-3.5 bg-slate-950/70 hover:bg-slate-850/80 border border-slate-800 hover:border-slate-700 rounded-xl transition-all text-left group disabled:opacity-50"
          >
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 group-hover:scale-105 transition-transform shrink-0">
              <Network className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Liberar DHCP / DNS</span>
                <span className="text-[10px] font-mono text-sky-400 bg-sky-950 px-1.5 py-0.5 rounded border border-sky-800/60">
                  53 & 67/68
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Abre portas para Kea DHCPv4 e BIND9/DNS na rede local.
              </p>
            </div>
          </button>
        </div>

        {/* Detalhes de Perfis Disponíveis */}
        {profiles.length > 0 && (
          <div className="pt-2">
            <details className="text-xs text-slate-400 group cursor-pointer">
              <summary className="font-medium text-slate-300 hover:text-white transition-colors py-1 flex items-center space-x-2">
                <span>Ver todos os {profiles.length} perfis de portas disponíveis</span>
              </summary>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-3 pt-3 border-t border-slate-800/60">
                {profiles.map((prof) => (
                  <div
                    key={prof.key}
                    className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-white text-xs">{prof.name}</span>
                        <button
                          onClick={() => handleApplyProfile(prof.key, prof.name)}
                          disabled={applyingProfile !== null}
                          className="px-2 py-0.5 text-[10px] font-semibold bg-orange-500 hover:bg-orange-600 text-white rounded transition-colors shadow-sm"
                        >
                          Aplicar
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2 mb-2">{prof.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-auto">
                      {prof.ports.slice(0, 6).map((port) => (
                        <span
                          key={port}
                          className="text-[9px] font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded"
                        >
                          {port}
                        </span>
                      ))}
                      {prof.ports.length > 6 && (
                        <span className="text-[9px] font-mono text-slate-500 self-center">
                          +{prof.ports.length - 6} portas
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>

      {/* 3. Seção Roteador / NAT (Gateway de Internet) */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center space-x-2">
              <Share2 className="w-4 h-4 text-sky-400" />
              <span>Roteador & Compartilhamento de Internet (NAT / Masquerade)</span>
            </h2>
            <p className="text-xs text-slate-400">
              Permite que estações na rede local (LAN) acessem a internet através da placa WAN deste servidor
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border ${
                natStatus?.enabled
                  ? 'bg-sky-950 text-sky-400 border-sky-800'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {natStatus?.enabled ? 'NAT ATIVO' : 'NAT DESATIVADO'}
            </span>
          </div>
        </div>

        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {/* Interface LAN (Entrada) */}
            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1.5 flex items-center space-x-1.5">
                <span>1. Interface de Entrada (LAN Local)</span>
                <span className="text-rose-400">*</span>
              </label>
              <select
                value={natLan}
                onChange={(e) => setNatLan(e.target.value)}
                disabled={configuringNat}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
              >
                <option value="">Selecione a interface LAN...</option>
                {interfaces.map((iface) => (
                  <option key={`lan-${iface.name}`} value={iface.name}>
                    {iface.name} ({iface.is_up ? 'ONLINE' : 'DOWN'}){' '}
                    {iface.ipv4 && iface.ipv4.length > 0 ? `• ${iface.ipv4[0].address}` : ''}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Placa conectada aos computadores/switches da rede interna.
              </span>
            </div>

            {/* Interface WAN (Saída para Internet) */}
            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1.5 flex items-center space-x-1.5">
                <span>2. Interface de Saída (WAN Internet)</span>
                <span className="text-rose-400">*</span>
              </label>
              <select
                value={natWan}
                onChange={(e) => setNatWan(e.target.value)}
                disabled={configuringNat}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
              >
                <option value="">Selecione a interface WAN...</option>
                {interfaces.map((iface) => (
                  <option key={`wan-${iface.name}`} value={iface.name}>
                    {iface.name} ({iface.is_up ? 'ONLINE' : 'DOWN'}){' '}
                    {iface.ipv4 && iface.ipv4.length > 0 ? `• ${iface.ipv4[0].address}` : ''}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Placa conectada ao modem ou roteador de acesso à Internet.
              </span>
            </div>

            {/* Sub-rede LAN Opcional */}
            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1.5 flex items-center space-x-1.5">
                <span>3. Sub-rede LAN (Opcional)</span>
              </label>
              <input
                type="text"
                value={natSubnet}
                onChange={(e) => setNatSubnet(e.target.value)}
                placeholder="Ex: 192.168.1.0/24"
                disabled={configuringNat}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Deixe em branco para mascarar todo o tráfego da placa LAN.
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
            <div className="flex items-center space-x-2 text-[11px] text-slate-400">
              <span
                className={`w-2 h-2 rounded-full ${
                  natStatus?.ip_forwarding ? 'bg-emerald-400' : 'bg-slate-500'
                }`}
              />
              <span>
                Kernel IPv4 Forwarding:{' '}
                <strong className={natStatus?.ip_forwarding ? 'text-emerald-400' : 'text-slate-400'}>
                  {natStatus?.ip_forwarding ? 'Habilitado (net.ipv4.ip_forward=1)' : 'Desabilitado'}
                </strong>
              </span>
            </div>

            <div className="flex items-center space-x-2">
              {natStatus?.enabled ? (
                <button
                  type="button"
                  onClick={() => handleConfigureNat(false)}
                  disabled={configuringNat}
                  className="px-4 py-2 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 font-semibold text-xs rounded-lg transition-colors flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>Desativar Roteamento NAT</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleConfigureNat(true)}
                  disabled={configuringNat}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs rounded-lg transition-colors flex items-center space-x-1.5 shadow-md shadow-orange-950/40 disabled:opacity-50"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Ativar Compartilhamento (NAT)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Tabela Interativa de Regras Numeradas */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center space-x-2">
              <Shield className="w-4 h-4 text-orange-400" />
              <span>Regras Ativas Numeradas (ufw status numbered)</span>
              <span className="text-[11px] font-normal text-slate-400 font-mono">
                ({filteredRules.length} de {status?.rules.length || 0})
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Regras perimetrais avaliadas em ordem sequencial no kernel
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {/* Campo de Busca */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar por porta, IP ou ação..."
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 w-56"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Botão Abrir Modal de Nova Regra */}
            <button
              onClick={() => setIsRuleModalOpen(true)}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Regra</span>
            </button>
          </div>
        </div>

        {/* Tabela de Regras */}
        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-3.5 py-2.5">#</th>
                <th className="px-3.5 py-2.5">Destino / Porta</th>
                <th className="px-3.5 py-2.5">Ação</th>
                <th className="px-3.5 py-2.5">Origem (From IP)</th>
                <th className="px-3.5 py-2.5">Comentário</th>
                <th className="px-3.5 py-2.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredRules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500 font-sans">
                    {searchQuery
                      ? 'Nenhuma regra corresponde aos critérios da busca.'
                      : 'Nenhuma regra configurada no momento.'}
                  </td>
                </tr>
              ) : (
                filteredRules.map((rule) => (
                  <tr key={rule.index} className="hover:bg-slate-850/60 transition-colors">
                    <td className="px-3.5 py-2.5 text-slate-400 font-bold">{rule.index}</td>
                    <td className="px-3.5 py-2.5 text-amber-300 font-semibold">{rule.to}</td>
                    <td className="px-3.5 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase ${
                          rule.action.includes('ALLOW')
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80'
                            : rule.action.includes('DENY')
                            ? 'bg-rose-950 text-rose-400 border border-rose-800/80'
                            : rule.action.includes('LIMIT')
                            ? 'bg-sky-950 text-sky-400 border border-sky-800/80'
                            : 'bg-amber-950 text-amber-400 border border-amber-800/80'
                        }`}
                      >
                        {rule.action}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-300">{rule.from_ip}</td>
                    <td className="px-3.5 py-2.5 text-slate-400 font-sans italic text-[11px]">
                      {rule.comment || '—'}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      <button
                        onClick={() => handleDeleteRule(rule.index)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title={`Excluir regra #${rule.index}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Modal para Criação de Regras Manuais */}
      {isRuleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Criar Nova Regra de Firewall</h3>
                  <p className="text-[11px] text-slate-400">
                    Defina portas, protocolos e permissões específicas no UFW
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsRuleModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddRuleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Ação */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Ação</label>
                  <select
                    value={ruleAction}
                    onChange={(e: any) => setRuleAction(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="allow">ALLOW (Permitir)</option>
                    <option value="deny">DENY (Bloquear silenciosamente)</option>
                    <option value="reject">REJECT (Rejeitar com RST)</option>
                    <option value="limit">LIMIT (Proteção contra brute-force)</option>
                  </select>
                </div>

                {/* Direção */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Direção</label>
                  <select
                    value={ruleDirection}
                    onChange={(e: any) => setRuleDirection(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="in">IN (Tráfego de Entrada)</option>
                    <option value="out">OUT (Tráfego de Saída)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Porta / Faixa */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Porta ou Faixa <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={rulePort}
                    onChange={(e) => setRulePort(e.target.value)}
                    placeholder="Ex: 80 ou 8080:8090"
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Número único ou faixa com :</span>
                </div>

                {/* Protocolo */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Protocolo</label>
                  <select
                    value={ruleProtocol}
                    onChange={(e: any) => setRuleProtocol(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                    <option value="any">ANY (TCP e UDP)</option>
                  </select>
                </div>
              </div>

              {/* Origem (From IP) */}
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Origem (IP ou Sub-rede CIDR)
                </label>
                <input
                  type="text"
                  value={ruleFromIp}
                  onChange={(e) => setRuleFromIp(e.target.value)}
                  placeholder="Qualquer lugar (Anywhere) ou ex: 192.168.1.0/24"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Deixe vazio para permitir de qualquer origem.
                </span>
              </div>

              {/* Comentário */}
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Comentário Descritivo
                </label>
                <input
                  type="text"
                  value={ruleComment}
                  onChange={(e) => setRuleComment(e.target.value)}
                  placeholder="Ex: Servidor Web HTTPS ou API Externa"
                  maxLength={64}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Prévia do Comando */}
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-amber-300/90">
                <span className="text-slate-500 select-none">$ </span>
                ufw {ruleAction} {ruleDirection} proto {ruleProtocol}
                {ruleFromIp.trim() ? ` from ${ruleFromIp.trim()}` : ''} to any port {rulePort || '...'}
                {ruleComment.trim() ? ` comment "${ruleComment.trim()}"` : ''}
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRuleModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-750 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingRule}
                  className="px-4 py-2 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors shadow-md shadow-orange-950/40 disabled:opacity-50"
                >
                  {submittingRule ? 'Aplicando...' : 'Criar Regra no UFW'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FirewallManager;
