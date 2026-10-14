import React, { useEffect, useState } from 'react';
import { 
  Network, 
  Save, 
  Eye, 
  FileCode, 
  Check, 
  AlertCircle, 
  Plus, 
  Trash2,
  RefreshCw,
  Terminal as TerminalIcon
} from 'lucide-react';
import { api, NetworkInterface } from '../services/api';
import { NetworkSetup } from '../components/NetworkSetup';

interface NetworkConfigProps {
  onOpenTerminalForTask: (taskId: string, title?: string) => void;
}

export const NetworkConfig: React.FC<NetworkConfigProps> = ({ onOpenTerminalForTask }) => {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'setup' | 'editor' | 'preview' | 'current'>('setup');
  
  // Netplan state
  const [selectedIface, setSelectedIface] = useState<string>('eth0');
  const [dhcp4, setDhcp4] = useState<boolean>(false);
  const [addresses, setAddresses] = useState<string[]>(['192.168.1.10/24']);
  const [gateway4, setGateway4] = useState<string>('192.168.1.1');
  const [dnsList, setDnsList] = useState<string>('192.168.1.1, 8.8.8.8');
  const [searchDomains, setSearchDomains] = useState<string>('empresa.lan');
  const [mtu, setMtu] = useState<number>(1500);

  const [previewYaml, setPreviewYaml] = useState<string>('');
  const [currentNetplanFile, setCurrentNetplanFile] = useState<string>('');
  const [applying, setApplying] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const ifaces = await api.getInterfaces();
      setInterfaces(ifaces);
      if (ifaces.length > 0 && !selectedIface) {
        setSelectedIface(ifaces[0].name);
      }
      const cur = await api.getNetplan();
      setCurrentNetplanFile(cur.content);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const buildNetplanPayload = () => {
    const dnsAddrs = dnsList
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const searches = searchDomains
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      renderer: 'networkd',
      ethernets: {
        [selectedIface]: {
          name: selectedIface,
          dhcp4,
          addresses: dhcp4 ? [] : addresses.filter(Boolean),
          gateway4: dhcp4 ? null : (gateway4.trim() || null),
          nameservers: {
            addresses: dnsAddrs,
            search: searches,
          },
          mtu,
        },
      },
    };
  };

  const handleGeneratePreview = async () => {
    setFeedback(null);
    try {
      const payload = buildNetplanPayload();
      const res = await api.previewNetplan(payload);
      setPreviewYaml(res.yaml);
      setActiveTab('preview');
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const handleApply = async () => {
    setFeedback(null);
    setApplying(true);
    try {
      const payload = buildNetplanPayload();
      const res = await api.applyNetplan(payload);
      setFeedback({ type: 'success', text: 'Configuração gravada. Aplicando via netplan apply...' });
      onOpenTerminalForTask(res.task_id, `Aplicação do Netplan (${selectedIface})`);
      loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setApplying(false);
    }
  };

  const addAddress = () => {
    setAddresses([...addresses, '192.168.1.20/24']);
  };

  const removeAddress = (idx: number) => {
    setAddresses(addresses.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Network className="w-5 h-5 text-indigo-400" />
            <span>Configuração de Rede e Netplan</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Gestão declarativa de interfaces Ubuntu via templates Jinja2 em /etc/netplan/01-netcfg.yaml
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar Interfaces</span>
        </button>
      </div>

      {/* Detected Interfaces Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {interfaces.map((iface) => (
          <div
            key={iface.name}
            onClick={() => setSelectedIface(iface.name)}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              selectedIface === iface.name
                ? 'bg-slate-750 border-sky-500 shadow-md shadow-sky-500/10'
                : 'bg-slate-800 border-slate-700 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono font-bold text-sm text-white">{iface.name}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  iface.is_up
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {iface.is_up ? 'UP' : 'DOWN'}
              </span>
            </div>
            <div className="text-xs text-slate-400 space-y-1 font-mono">
              <div>MAC: {iface.mac || 'n/a'}</div>
              <div>
                IP:{' '}
                {iface.ipv4.length > 0
                  ? iface.ipv4.map((ip) => ip.address).join(', ')
                  : 'Nenhum IP atribuído'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-4 text-xs font-medium">
        <button
          onClick={() => setActiveTab('setup')}
          className={`pb-2 transition-colors border-b-2 flex items-center space-x-1.5 ${
            activeTab === 'setup'
              ? 'border-sky-500 text-sky-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <TerminalIcon className="w-3.5 h-3.5 text-sky-400" />
          <span>Assistente Rápido (WebSocket)</span>
        </button>

        <button
          onClick={() => setActiveTab('editor')}
          className={`pb-2 transition-colors border-b-2 flex items-center space-x-1.5 ${
            activeTab === 'editor'
              ? 'border-sky-500 text-sky-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Editor Completo Netplan</span>
        </button>

        <button
          onClick={handleGeneratePreview}
          className={`pb-2 transition-colors border-b-2 flex items-center space-x-1.5 ${
            activeTab === 'preview'
              ? 'border-sky-500 text-sky-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Prévia Netplan (YAML)</span>
        </button>

        <button
          onClick={() => setActiveTab('current')}
          className={`pb-2 transition-colors border-b-2 flex items-center space-x-1.5 ${
            activeTab === 'current'
              ? 'border-sky-500 text-sky-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileCode className="w-3.5 h-3.5" />
          <span>Arquivo Atual (/etc/netplan)</span>
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

      {/* Tab: Setup (Componente NetworkSetup com WebSocket e xterm.js) */}
      {activeTab === 'setup' && (
        <NetworkSetup onSuccess={loadData} />
      )}

      {/* Tab: Editor */}
      {activeTab === 'editor' && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-sm space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Interface Selecionada
              </label>
              <input
                type="text"
                value={selectedIface}
                onChange={(e) => setSelectedIface(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Modo de Endereçamento
              </label>
              <div className="flex items-center space-x-4 mt-2">
                <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    checked={dhcp4}
                    onChange={() => setDhcp4(true)}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Cliente DHCP (Automático)</span>
                </label>
                <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    checked={!dhcp4}
                    onChange={() => setDhcp4(false)}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>IP Estático (Manual)</span>
                </label>
              </div>
            </div>
          </div>

          {!dhcp4 && (
            <div className="space-y-4 pt-2 border-t border-slate-800">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-slate-300">
                    Endereços IPv4 (Notação CIDR)
                  </label>
                  <button
                    onClick={addAddress}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar IP</span>
                  </button>
                </div>
                {addresses.map((addr, idx) => (
                  <div key={idx} className="flex items-center space-x-2 mb-2">
                    <input
                      type="text"
                      value={addr}
                      onChange={(e) => {
                        const copy = [...addresses];
                        copy[idx] = e.target.value;
                        setAddresses(copy);
                      }}
                      placeholder="Ex: 192.168.1.10/24"
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                    />
                    {addresses.length > 1 && (
                      <button
                        onClick={() => removeAddress(idx)}
                        className="p-2 text-slate-400 hover:text-rose-400 bg-slate-800 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Gateway Padrão (IPv4)
                  </label>
                  <input
                    type="text"
                    value={gateway4}
                    onChange={(e) => setGateway4(e.target.value)}
                    placeholder="Ex: 192.168.1.1"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    MTU da Interface
                  </label>
                  <input
                    type="number"
                    value={mtu}
                    onChange={(e) => setMtu(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Servidores DNS (Separados por vírgula)
              </label>
              <input
                type="text"
                value={dnsList}
                onChange={(e) => setDnsList(e.target.value)}
                placeholder="Ex: 192.168.1.1, 8.8.8.8"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Domínios de Busca DNS (Search)
              </label>
              <input
                type="text"
                value={searchDomains}
                onChange={(e) => setSearchDomains(e.target.value)}
                placeholder="Ex: empresa.lan"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="pt-4 flex items-center space-x-3">
            <button
              onClick={handleApply}
              disabled={applying}
              className="flex items-center space-x-2 px-4 py-2 text-xs font-semibold rounded-lg bg-sky-500 hover:bg-sky-600 text-white transition-all shadow-md shadow-sky-950/40"
            >
              <Save className="w-4 h-4" />
              <span>Gravar e Aplicar (netplan apply)</span>
            </button>

            <button
              onClick={handleGeneratePreview}
              className="flex items-center space-x-2 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              <Eye className="w-4 h-4 text-sky-400" />
              <span>Pré-visualizar YAML</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab: Preview */}
      {activeTab === 'preview' && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Prévia do Arquivo YAML Jinja2 Renderizado</h3>
            <button
              onClick={handleApply}
              disabled={applying}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-500 hover:bg-sky-600 text-white transition-all shadow-md"
            >
              Aplicar Esta Configuração
            </button>
          </div>
          <pre className="p-4 bg-slate-950 border border-slate-700 rounded-lg font-mono text-xs text-sky-200 overflow-x-auto">
            {previewYaml || 'Nenhuma prévia gerada ainda. Clique em "Pré-visualizar YAML".'}
          </pre>
        </div>
      )}

      {/* Tab: Current */}
      {activeTab === 'current' && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-white">Conteúdo do Arquivo no Servidor</h3>
          <pre className="p-4 bg-slate-950 border border-slate-700 rounded-lg font-mono text-xs text-slate-300 overflow-x-auto">
            {currentNetplanFile || 'Arquivo não encontrado ou vazio.'}
          </pre>
        </div>
      )}
    </div>
  );
};
