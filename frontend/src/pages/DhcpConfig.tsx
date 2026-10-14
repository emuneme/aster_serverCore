import React, { useEffect, useState } from 'react';
import { 
  Globe, 
  Save, 
  Eye, 
  AlertCircle, 
  RefreshCw,
  Layers,
  CheckCircle2, 
  Loader2, 
  ShieldCheck, 
  Radio
} from 'lucide-react';
import { api, DhcpLease, NetworkInterface } from '../services/api';

interface DhcpConfigProps {
  onOpenTerminalForTask: (taskId: string, title?: string) => void;
}

export const DhcpConfig: React.FC<DhcpConfigProps> = ({ onOpenTerminalForTask }) => {
  // Service status
  const [serviceStatus, setServiceStatus] = useState<any>(null);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);

  // Interfaces
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);

  // Kea Form State (DhcpConfigRequest)
  const [interfaceName, setInterfaceName] = useState<string>('eth0');
  const [subnet, setSubnet] = useState<string>('192.168.1.0/24');
  const [poolStart, setPoolStart] = useState<string>('192.168.1.100');
  const [poolEnd, setPoolEnd] = useState<string>('192.168.1.200');
  const [routers, setRouters] = useState<string>('192.168.1.1');
  const [dnsServers, setDnsServers] = useState<string>('127.0.0.1, 8.8.8.8');
  const [leaseTime, setLeaseTime] = useState<number>(86400);

  // Active leases
  const [leases, setLeases] = useState<DhcpLease[]>([]);
  const [loadingLeases, setLoadingLeases] = useState(false);

  // Navigation & feedback
  const [activeTab, setActiveTab] = useState<'editor' | 'leases' | 'preview'>('editor');
  const [previewContent, setPreviewContent] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isApplying, setIsApplying] = useState<boolean>(false);

  const loadAllData = async () => {
    setLoadingStatus(true);
    setLoadingLeases(true);
    try {
      const [st, ls, ifaces] = await Promise.all([
        api.getDhcpStatus().catch(() => null),
        api.getDhcpLeases().catch(() => []),
        api.getInterfaces().catch(() => []),
      ]);

      if (st) setServiceStatus(st);
      setLeases(ls || []);
      setInterfaces(ifaces || []);

      if (ifaces && ifaces.length > 0) {
        const active = ifaces.find((i: NetworkInterface) => i.is_up && i.name !== 'lo0');
        if (active && (!interfaceName || interfaceName === 'eth0')) {
          setInterfaceName(active.name);
        }
      }
    } catch (e: any) {
      console.error('Falha ao carregar dados DHCP:', e);
    } finally {
      setLoadingStatus(false);
      setLoadingLeases(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const buildPayload = () => {
    const routersList = routers
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const dnsList = dnsServers
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      interface: interfaceName,
      subnet: subnet.trim(),
      pool_start: poolStart.trim(),
      pool_end: poolEnd.trim(),
      routers: routersList,
      dns_servers: dnsList.length > 0 ? dnsList : ['127.0.0.1'],
      lease_time: Number(leaseTime) || 86400,
    };
  };

  const handlePreview = async () => {
    setFeedback(null);
    try {
      const payload = buildPayload();
      const res = await api.previewDhcp(payload);
      setPreviewContent(res.content);
      setActiveTab('preview');
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const handleApply = async () => {
    setFeedback(null);
    setIsApplying(true);
    try {
      const payload = buildPayload();
      const res = await api.applyDhcp(payload);
      setFeedback({ 
        type: 'success', 
        text: 'Configuração gravada e validada com kea-dhcp4 -t. Serviço reiniciado!' 
      });
      onOpenTerminalForTask(res.task_id, 'Aplicação do Servidor Kea DHCPv4');
      loadAllData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Status Card */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-xl">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Servidor Kea DHCPv4 (kea-dhcp4-server)
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono">
                  ISC Kea
                </span>
              </h2>
              <p className="text-sm text-slate-400">
                Distribuição automatizada de IPs, sub-redes, gateways e opções DNS no Ubuntu Server.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
              serviceStatus?.active
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}>
              <span className={`w-2 h-2 rounded-full ${serviceStatus?.active ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
              <span>{serviceStatus?.active ? 'ATIVO (RUNNING)' : 'INATIVO'}</span>
            </div>

            <button
              onClick={loadAllData}
              disabled={loadingStatus}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition"
              title="Recarregar status e concessões"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        {feedback && (
          <div className={`mt-4 p-4 rounded-lg flex items-center gap-3 text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}>
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-slate-800 space-x-6 text-xs font-medium mt-6">
          <button
            onClick={() => setActiveTab('editor')}
            className={`pb-3 transition-colors border-b-2 flex items-center space-x-2 ${
              activeTab === 'editor'
                ? 'border-sky-500 text-sky-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Configuração do Pool (Kea)</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('leases');
              loadAllData();
            }}
            className={`pb-3 transition-colors border-b-2 flex items-center space-x-2 ${
              activeTab === 'leases'
                ? 'border-sky-500 text-sky-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-4 h-4 text-emerald-400" />
            <span>Concessões Ativas (Leases) ({leases.length})</span>
          </button>

          <button
            onClick={handlePreview}
            className={`pb-3 transition-colors border-b-2 flex items-center space-x-2 ${
              activeTab === 'preview'
                ? 'border-sky-500 text-sky-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>Visualizar JSON (/etc/kea/kea-dhcp4.conf)</span>
          </button>
        </div>

        {/* Tab Content: Editor */}
        {activeTab === 'editor' && (
          <div className="space-y-6 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Interface */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  1. Interface de Rede
                </label>
                <select
                  value={interfaceName}
                  onChange={(e) => setInterfaceName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:border-sky-500"
                >
                  {interfaces.map((iface) => (
                    <option key={iface.name} value={iface.name}>
                      {iface.name} {iface.is_up ? '(Online)' : '(Down)'} {iface.ipv4.length > 0 ? `[${iface.ipv4[0].address}]` : ''}
                    </option>
                  ))}
                  <option value="*">* (Todas as placas de rede)</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Interface vinculada em <code className="text-slate-300">interfaces-config</code>.
                </p>
              </div>

              {/* Sub-rede */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  2. Sub-rede IPv4 (CIDR) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={subnet}
                  onChange={(e) => setSubnet(e.target.value)}
                  placeholder="Ex: 192.168.1.0/24"
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:border-sky-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Sub-rede e máscara de rede (ex: <code className="text-slate-300">192.168.1.0/24</code>).
                </p>
              </div>

              {/* Pool Início */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  3. Primeiro IP do Pool Dinâmico <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={poolStart}
                  onChange={(e) => setPoolStart(e.target.value)}
                  placeholder="Ex: 192.168.1.100"
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:border-sky-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Deve pertencer obrigatoriamente à sub-rede informada.
                </p>
              </div>

              {/* Pool Fim */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  4. Último IP do Pool Dinâmico <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={poolEnd}
                  onChange={(e) => setPoolEnd(e.target.value)}
                  placeholder="Ex: 192.168.1.200"
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:border-sky-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Maior ou igual ao IP inicial e contido na sub-rede.
                </p>
              </div>

              {/* Gateway (Routers) */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  5. Gateway Padrão (Routers)
                </label>
                <input
                  type="text"
                  value={routers}
                  onChange={(e) => setRouters(e.target.value)}
                  placeholder="Ex: 192.168.1.1"
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:border-sky-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Enviado na Opção DHCP 3 (<code className="text-slate-300">routers</code>).
                </p>
              </div>

              {/* DNS Servers */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  6. Servidores DNS Recursivos
                </label>
                <input
                  type="text"
                  value={dnsServers}
                  onChange={(e) => setDnsServers(e.target.value)}
                  placeholder="Ex: 127.0.0.1, 8.8.8.8"
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:border-sky-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Enviado na Opção DHCP 6 (<code className="text-slate-300">domain-name-servers</code>).
                </p>
              </div>
            </div>

            {/* Tempo de Concessão */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-2">
              <label className="block text-xs font-medium text-slate-300">
                7. Tempo de Concessão de IP (Lease Time em segundos)
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="number"
                  min="60"
                  value={leaseTime}
                  onChange={(e) => setLeaseTime(Number(e.target.value))}
                  className="w-48 bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={() => setLeaseTime(43200)}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                >
                  12 Horas (43200s)
                </button>
                <button
                  type="button"
                  onClick={() => setLeaseTime(86400)}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                >
                  24 Horas (86400s) [Padrão]
                </button>
                <button
                  type="button"
                  onClick={() => setLeaseTime(604800)}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                >
                  7 Dias (604800s)
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Determina <code className="text-slate-300">valid-lifetime</code>, <code className="text-slate-300">renew-timer</code> (50%) e <code className="text-slate-300">rebind-timer</code> (87.5%).
              </p>
            </div>

            {/* Box de Segurança e Validação */}
            <div className="bg-sky-950/20 border border-sky-800/40 rounded-lg p-4 text-xs space-y-1.5">
              <div className="flex items-center gap-2 text-sky-400 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                Proteções do Serviço Kea DHCP
              </div>
              <ul className="text-slate-400 space-y-1 list-disc pl-4">
                <li>Instalação automática de dependências via <code className="text-slate-300">apt-get install -y kea-dhcp4-server</code>.</li>
                <li>Validação estrita de sintaxe executando <code className="text-slate-300">kea-dhcp4 -t /etc/kea/kea-dhcp4.conf</code> antes do reinício.</li>
                <li>Backup automático e restauração de segurança (rollback) em caso de falha de validação.</li>
              </ul>
            </div>

            {/* Botão de Ação */}
            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={handleApply}
                disabled={isApplying || !subnet || !poolStart || !poolEnd}
                className="flex-1 py-3 px-4 rounded-xl font-medium text-sm flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-600 text-white shadow-lg shadow-sky-500/20 transition active:scale-[0.99] disabled:opacity-50"
              >
                {isApplying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Validando e Reiniciando Kea DHCP...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Gravar e Reiniciar Kea DHCPv4</span>
                  </>
                )}
              </button>

              <button
                onClick={handlePreview}
                className="px-4 py-3 rounded-xl font-medium text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-2"
              >
                <Eye className="w-4 h-4 text-sky-400" />
                <span>Ver JSON</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab Content: Leases */}
        {activeTab === 'leases' && (
          <div className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Concessões Ativas de IP na Rede Local
                </h3>
                <p className="text-xs text-slate-400">
                  Lidas diretamente do arquivo <code className="text-slate-300 font-mono">/var/lib/kea/kea-leases4.csv</code>.
                </p>
              </div>

              <button
                onClick={loadAllData}
                disabled={loadingLeases}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLeases ? 'animate-spin' : ''}`} />
                <span>Atualizar Leases</span>
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Endereço IP</th>
                    <th className="px-4 py-3">Endereço MAC</th>
                    <th className="px-4 py-3">Hostname</th>
                    <th className="px-4 py-3">Expiração</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                  {leases.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500 font-sans">
                        Nenhuma concessão ativa encontrada no momento.
                      </td>
                    </tr>
                  ) : (
                    leases.map((lease, idx) => (
                      <tr key={idx} className="hover:bg-slate-850/60 transition">
                        <td className="px-4 py-3 font-semibold text-sky-400">{lease.ip_address}</td>
                        <td className="px-4 py-3 text-slate-300">{lease.mac_address}</td>
                        <td className="px-4 py-3 text-white font-sans">{lease.hostname || 'n/a'}</td>
                        <td className="px-4 py-3 text-slate-400">{lease.expire_time || 'n/a'}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Ativo
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab Content: Preview */}
        {activeTab === 'preview' && (
          <div className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Configuração JSON gerada para <code className="text-slate-300 font-mono">/etc/kea/kea-dhcp4.conf</code>:
              </span>
              <button
                onClick={() => setActiveTab('editor')}
                className="text-xs text-sky-400 hover:underline"
              >
                Voltar ao formulário
              </button>
            </div>
            <pre className="bg-[#0b0f17] border border-slate-800 p-4 rounded-xl text-xs font-mono text-slate-200 overflow-x-auto max-h-[400px]">
              {previewContent || 'Clique em "Ver JSON" para carregar a prévia.'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
