import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { Network, IpfsConfig, THEME_PRESETS, AppTheme } from '../types';
import {
  Plus, Trash2, Save, Shield, Database, Network as NetworkIcon,
  CheckCircle, AlertCircle, Loader2, Eye, EyeOff, Server, Palette, Sun, Moon,
} from 'lucide-react';
import { switchNetwork as walletSwitchNetwork } from '../wallet/walletManager';

export function Settings() {
  const { network, setNetwork, ipfsConfig, setIpfsConfig, addNotification, theme, setTheme, applyTheme } = useAppStore();

  const [customNetworks, setCustomNetworks] = useState<Network[]>([]);
  const [newNetwork, setNewNetwork] = useState<Partial<Network>>({
    name: '', rpcUrl: '', chainId: 0, symbol: '', explorerUrl: '', isTestnet: false,
  });

  const [ipfsForm, setIpfsForm] = useState<IpfsConfig>({ ...ipfsConfig });
  const [showSecrets, setShowSecrets] = useState(false);
  const [isSavingIpfs, setIsSavingIpfs] = useState(false);

  
  const handleNetworkSelect = async (n: Network) => {
    setNetwork(n);
    if (!(window as any).ethereum) return; 
    try {
      await walletSwitchNetwork(n.chainId);
    } catch (err: any) {
      const isRejected = err.code === 4001 || err.code === 'ACTION_REJECTED';
      if (!isRejected) {
        addNotification({
          type: 'info',
          title: 'App Switched — Wallet May Differ',
          message: `App is set to ${n.name}. Switch your wallet manually if needed.`,
          duration: 5000,
        });
      }
    }
  };
  const [ipfsStatus, setIpfsStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.ok ? setServerStatus('online') : setServerStatus('offline'))
      .catch(() => setServerStatus('offline'));
  }, []);

  useEffect(() => {
    fetch('/api/ipfs/config?userId=default')
      .then((r) => r.json())
      .then((data) => {
        if (data.configured) {
          setIpfsForm((prev) => ({ ...prev, provider: data.provider, gateway: data.gateway }));
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveIpfs = async () => {
    setIsSavingIpfs(true);
    setIpfsStatus('idle');
    try {
      const res = await fetch('/api/ipfs/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'default', ...ipfsForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save config');
      setIpfsConfig(ipfsForm);
      setIpfsStatus('success');
      addNotification({ type: 'success', title: 'IPFS Config Saved', message: 'Your IPFS configuration has been saved securely.', duration: 3000 });
    } catch (err: any) {
      setIpfsStatus('error');
      addNotification({ type: 'error', title: 'Save Failed', message: err.message, duration: 5000 });
    } finally {
      setIsSavingIpfs(false);
    }
  };

  const handleAddNetwork = () => {
    if (!newNetwork.name?.trim() || !newNetwork.rpcUrl?.trim() || !newNetwork.chainId) {
      addNotification({ type: 'error', title: 'Validation Error', message: 'Name, RPC URL, and Chain ID are required.', duration: 4000 });
      return;
    }
    if (customNetworks.some((n) => n.chainId === newNetwork.chainId)) {
      addNotification({ type: 'error', title: 'Duplicate Network', message: `Chain ID ${newNetwork.chainId} already exists.`, duration: 4000 });
      return;
    }
    setCustomNetworks([...customNetworks, newNetwork as Network]);
    setNewNetwork({ name: '', rpcUrl: '', chainId: 0, symbol: '', explorerUrl: '', isTestnet: false });
    addNotification({ type: 'success', title: 'Network Added', message: `${newNetwork.name} added to custom networks.`, duration: 3000 });
  };

  const NETWORKS = [
    { chainId: 25,  name: 'Cronos Mainnet', rpcUrl: 'https://evm.cronos.org',    symbol: 'CRO',  explorerUrl: 'https://explorer.cronos.org', isTestnet: false },
    { chainId: 338, name: 'Cronos Testnet', rpcUrl: 'https://evm-t3.cronos.org', symbol: 'TCRO', explorerUrl: 'https://explorer.cronos.org/testnet', isTestnet: true },
    ...customNetworks,
  ];

  const SectionCard = ({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) => (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800">
        <div className="p-2 bg-slate-800 rounded-lg"><Icon className="w-4 h-4 text-blue-400" /></div>
        <h2 className="text-base font-bold text-white">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );

  const Input = ({ label, type = 'text', ...props }: { label: string; type?: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      <input type={type} {...props} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none transition-colors" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Settings</h1>
        <p className="text-slate-400 text-sm">Configure IPFS storage, networks, and server connection.</p>
      </div>

      {}
      <div className={`flex items-center gap-3 p-4 rounded-xl border text-sm ${
        serverStatus === 'online'   ? 'bg-green-500/8 border-green-500/20' :
        serverStatus === 'offline'  ? 'bg-red-500/8 border-red-500/20' :
        'bg-slate-800 border-slate-700'}`}>
        <Server className={`w-4 h-4 ${serverStatus === 'online' ? 'text-green-400' : serverStatus === 'offline' ? 'text-red-400' : 'text-slate-400'}`} />
        <span className={serverStatus === 'online' ? 'text-green-400' : serverStatus === 'offline' ? 'text-red-400' : 'text-slate-400'}>
          {serverStatus === 'checking' ? 'Checking backend server…' :
           serverStatus === 'online'   ? 'Backend server online — compilation and IPFS uploads are available' :
           'Backend server offline — start it with npm run dev (compilation and IPFS uploads unavailable)'}
        </span>
      </div>

      {}
      <SectionCard title="Network" icon={NetworkIcon}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {NETWORKS.map((n) => (
            <button key={n.chainId} onClick={() => handleNetworkSelect(n)}
              className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
                network.chainId === n.chainId ? 'bg-blue-600/10 border-blue-500/40' : 'bg-slate-950 border-slate-800 hover:border-slate-600'
              }`}>
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${n.isTestnet ? 'bg-yellow-500' : 'bg-green-500'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-semibold truncate">{n.name}</p>
                <p className="text-slate-500 text-xs">Chain ID {n.chainId} · {n.symbol}</p>
              </div>
              {network.chainId === n.chainId && <CheckCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />}
            </button>
          ))}
        </div>

        <div className="border-t border-slate-800 pt-5">
          <p className="text-sm font-semibold text-white mb-4">Add Custom Network</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <Input label="Network Name" placeholder="My Network" value={newNetwork.name || ''} onChange={(e) => setNewNetwork((p) => ({ ...p, name: e.target.value }))} />
            <Input label="Chain ID" type="number" placeholder="1234" value={newNetwork.chainId || ''} onChange={(e) => setNewNetwork((p) => ({ ...p, chainId: Number(e.target.value) }))} />
            <Input label="RPC URL" placeholder="https://rpc.example.com" value={newNetwork.rpcUrl || ''} onChange={(e) => setNewNetwork((p) => ({ ...p, rpcUrl: e.target.value }))} />
            <Input label="Symbol" placeholder="ETH" value={newNetwork.symbol || ''} onChange={(e) => setNewNetwork((p) => ({ ...p, symbol: e.target.value }))} />
            <Input label="Explorer URL" placeholder="https://explorer.example.com" value={newNetwork.explorerUrl || ''} onChange={(e) => setNewNetwork((p) => ({ ...p, explorerUrl: e.target.value }))} />
            <div className="flex items-center gap-3 pt-6">
              <button onClick={() => setNewNetwork((p) => ({ ...p, isTestnet: !p.isTestnet }))}
                className={`w-9 h-5 rounded-full transition-colors relative ${newNetwork.isTestnet ? 'bg-yellow-500' : 'bg-slate-700'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${newNetwork.isTestnet ? 'left-[18px]' : 'left-0.5'}`} />
              </button>
              <span className="text-sm text-slate-400">Testnet</span>
            </div>
          </div>
          <button onClick={handleAddNetwork}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Add Network
          </button>
        </div>
      </SectionCard>

      {}
      <SectionCard title="IPFS Storage" icon={Database}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Storage Provider</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['lighthouse', 'pinata', 'infura', 'manual'] as const).map((p) => (
                <button key={p} onClick={() => setIpfsForm((prev) => ({ ...prev, provider: p }))}
                  className={`py-2.5 rounded-lg text-sm font-semibold capitalize transition-colors ${ipfsForm.provider === p ? 'bg-blue-600 text-white' : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {ipfsForm.provider !== 'manual' && (
            <div className="space-y-3">
              {ipfsForm.provider === 'pinata' && (
                <>
                  <div className="relative">
                    <Input label="Pinata API Key" placeholder="Pinata API key" type={showSecrets ? 'text' : 'password'}
                      value={ipfsForm.apiKey || ''} onChange={(e) => setIpfsForm((p) => ({ ...p, apiKey: e.target.value }))} />
                    <button onClick={() => setShowSecrets(!showSecrets)} className="absolute right-3 top-8 text-slate-500 hover:text-white transition-colors">
                      {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Input label="Pinata Secret Key" placeholder="Pinata secret key" type={showSecrets ? 'text' : 'password'}
                    value={ipfsForm.apiSecret || ''} onChange={(e) => setIpfsForm((p) => ({ ...p, apiSecret: e.target.value }))} />
                </>
              )}
              {ipfsForm.provider === 'lighthouse' && (
                <Input label="Lighthouse API Key" placeholder="Get free key at lighthouse.storage" type={showSecrets ? 'text' : 'password'}
                  value={ipfsForm.apiKey || ''} onChange={(e) => setIpfsForm((p) => ({ ...p, apiKey: e.target.value }))} />
              )}
              {ipfsForm.provider === 'infura' && (
                <>
                  <Input label="Infura Project ID" placeholder="Infura project ID" type={showSecrets ? 'text' : 'password'}
                    value={ipfsForm.apiKey || ''} onChange={(e) => setIpfsForm((p) => ({ ...p, apiKey: e.target.value }))} />
                  <Input label="Infura API Secret" placeholder="Infura API secret" type={showSecrets ? 'text' : 'password'}
                    value={ipfsForm.apiSecret || ''} onChange={(e) => setIpfsForm((p) => ({ ...p, apiSecret: e.target.value }))} />
                </>
              )}
            </div>
          )}

          <Input label="IPFS Gateway (optional)" placeholder="https://gateway.pinata.cloud" value={ipfsForm.gateway || ''}
            onChange={(e) => setIpfsForm((p) => ({ ...p, gateway: e.target.value }))} />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Shield className="w-3.5 h-3.5" /> Keys are AES-256 encrypted on the server
            </div>
            <div className="flex items-center gap-3">
              {ipfsStatus === 'success' && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Saved</span>}
              {ipfsStatus === 'error' && <span className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Failed</span>}
              <button onClick={handleSaveIpfs} disabled={isSavingIpfs}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-colors">
                {isSavingIpfs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {isSavingIpfs ? 'Saving…' : 'Save Config'}
              </button>
            </div>
          </div>
        </div>
      </SectionCard>

      {}
      <SectionCard title="Appearance & Themes" icon={Palette}>
        <div className="space-y-6">

          {}
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">Color Presets</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">

              {}
              {Object.entries(THEME_PRESETS).map(([key, t]) => (
                <button key={key} onClick={() => { applyTheme(key); addNotification({ type: 'success', title: 'Theme Applied', message: `${key.charAt(0).toUpperCase() + key.slice(1)} theme activated.`, duration: 2000 }); }}
                  className={`relative p-4 rounded-xl border text-left transition-all ${
                    theme.preset === key
                      ? 'border-blue-500/50 ring-1 ring-blue-500/30'
                      : 'border-slate-800 hover:border-slate-600'
                  }`}
                  style={{ background: t.bgSurface }}>
                  <div className="flex gap-1.5 mb-3">
                    {[t.bgBase, t.bgSurface, t.accentPrimary, t.textSecondary].map((col, i) => (
                      <span key={i} className="w-5 h-5 rounded-full border border-white/10 flex-shrink-0" style={{ background: col }} />
                    ))}
                  </div>
                  <p className="text-sm font-bold capitalize" style={{ color: t.textPrimary }}>{key}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: t.textMuted }}>
                    {key === 'midnight' ? 'Default dark' :
                     key === 'obsidian' ? 'Deep black + purple' :
                     key === 'forest'   ? 'Navy + green' :
                     key === 'flame'    ? 'Dark + orange' :
                     key === 'arctic'   ? 'Light mode' :
                     key === 'rose'     ? 'Dark + pink' :
                     key === 'cronos'   ? 'Emerald · logo style' : ''}
                  </p>
                  {theme.preset === key && (
                    <CheckCircle className="absolute top-3 right-3 w-4 h-4 text-blue-400" />
                  )}
                </button>
              ))}

              {}
              <button
                onClick={() => {
                  
                  setTheme({ preset: 'custom' });
                  addNotification({ type: 'info', title: 'Custom Mode Active', message: 'Use the color pickers below to edit your theme live.', duration: 3000 });
                }}
                className={`relative p-4 rounded-xl border text-left transition-all ${
                  theme.preset === 'custom'
                    ? 'border-blue-500/50 ring-1 ring-blue-500/30 bg-slate-900'
                    : 'border-slate-700 border-dashed hover:border-slate-500 bg-slate-950'
                }`}>
                <div className="flex gap-1.5 mb-3">
                  {['bgBase','bgSurface','accentPrimary','textSecondary'].map((k) => (
                    <span key={k} className="w-5 h-5 rounded-full border border-white/10 flex-shrink-0"
                      style={{ background: (theme[k as keyof AppTheme] as string) || '#888' }} />
                  ))}
                </div>
                <p className="text-sm font-bold text-white">Custom</p>
                <p className="text-[10px] mt-0.5 text-slate-500">Your own colors</p>
                {theme.preset === 'custom' && (
                  <CheckCircle className="absolute top-3 right-3 w-4 h-4 text-blue-400" />
                )}
              </button>
            </div>
          </div>

          {}
          <div className={`rounded-2xl border transition-all ${
            theme.preset === 'custom'
              ? 'border-blue-500/30 bg-slate-950/60'
              : 'border-slate-800 bg-slate-950/30 opacity-70'
          } p-5`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-bold text-white">Custom Colors</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {theme.preset === 'custom'
                    ? 'Editing live — changes apply to the whole app instantly'
                    : 'Select "Custom" above to enable live editing'}
                </p>
              </div>
              {theme.preset === 'custom' && (
                <span className="px-2 py-0.5 bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-bold rounded-full">
                  ACTIVE
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {([
                { key: 'bgBase',        label: 'Page Background',          cssVar: '--bg-base' },
                { key: 'bgSurface',     label: 'Card Background',          cssVar: '--bg-surface' },
                { key: 'bgSidebar',     label: 'Sidebar Background',       cssVar: '--bg-sidebar' },
                { key: 'bgRaised',      label: 'Hover / Raised BG',        cssVar: '--bg-raised' },
                { key: 'borderColor',   label: 'Border Color',             cssVar: '--border-color' },
                { key: 'accentPrimary', label: 'Accent / Buttons',         cssVar: '--accent-primary' },
                { key: 'accentHover',   label: 'Accent Hover',             cssVar: '--accent-hover' },
                { key: 'textPrimary',   label: 'Primary Text',             cssVar: '--text-primary' },
                { key: 'textSecondary', label: 'Secondary Text',           cssVar: '--text-secondary' },
                { key: 'textMuted',     label: 'Muted Text',               cssVar: '--text-muted' },
                { key: 'colorSuccess',  label: 'Success Color',            cssVar: '--color-success' },
                { key: 'colorInfo',     label: 'Info / Link Color',        cssVar: '--color-info' },
              ] as { key: keyof AppTheme; label: string; cssVar: string }[]).map(({ key, label, cssVar }) => {
                const currentVal = (theme[key] as string) || '#000000';
                const isValidHex = /^#[0-9a-fA-F]{6}$/.test(currentVal);

                const applyColor = (val: string) => {
                  
                  document.documentElement.style.setProperty(cssVar, val);
                  
                  setTheme({ [key]: val, preset: 'custom' });
                };

                return (
                  <div key={key}>
                    <label className="block text-xs text-slate-500 mb-1.5 font-medium">{label}</label>
                    <div className="flex items-center gap-2">
                      {}
                      <label className="relative cursor-pointer flex-shrink-0">
                        <span
                          className="block w-9 h-9 rounded-lg border-2 border-slate-600 hover:border-slate-400 transition-colors shadow-inner"
                          style={{ background: isValidHex ? currentVal : '#888888' }}
                        />
                        <input
                          type="color"
                          value={isValidHex ? currentVal : '#000000'}
                          onChange={(e) => applyColor(e.target.value)}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                      </label>
                      {}
                      <input
                        type="text"
                        value={currentVal}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTheme({ [key]: val, preset: 'custom' });
                          if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                            document.documentElement.style.setProperty(cssVar, val);
                          }
                        }}
                        onBlur={(e) => {
                          
                          const val = e.target.value;
                          if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                            document.documentElement.style.setProperty(cssVar, val);
                          }
                        }}
                        maxLength={7}
                        placeholder="#000000"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white font-mono focus:border-blue-500 outline-none min-w-0 transition-colors"
                        style={{ borderColor: isValidHex ? currentVal + '60' : undefined }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {}
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-800">
              <p className="text-xs text-slate-600">
                {theme.preset === 'custom' ? 'Theme saved automatically to your browser' : 'Click a color to start customising'}
              </p>
              <div className="flex gap-2">
                {theme.preset === 'custom' && (
                  <button
                    onClick={() => {
                      
                      const currentThemeColors = { ...theme, preset: 'custom' };
                      
                      Object.entries({
                        '--bg-base': currentThemeColors.bgBase,
                        '--bg-surface': currentThemeColors.bgSurface,
                        '--bg-elevated': currentThemeColors.bgElevated,
                        '--bg-sidebar': currentThemeColors.bgSidebar,
                        '--bg-raised': currentThemeColors.bgRaised,
                        '--border-color': currentThemeColors.borderColor,
                        '--text-primary': currentThemeColors.textPrimary,
                        '--text-secondary': currentThemeColors.textSecondary,
                        '--text-muted': currentThemeColors.textMuted,
                        '--accent-primary': currentThemeColors.accentPrimary,
                        '--accent-hover': currentThemeColors.accentHover,
                        '--accent-text': currentThemeColors.accentText,
                        '--color-success': currentThemeColors.colorSuccess,
                        '--color-warning': currentThemeColors.colorWarning,
                        '--color-error': currentThemeColors.colorError,
                        '--color-info': currentThemeColors.colorInfo,
                      }).forEach(([varName, val]) => {
                        if (val) document.documentElement.style.setProperty(varName, val);
                      });
                      addNotification({ type: 'success', title: 'Theme Re-applied', message: 'All custom colors have been re-applied.', duration: 2000 });
                    }}
                    className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded-lg text-xs font-bold transition-colors border border-blue-500/30">
                    Re-apply All
                  </button>
                )}
                <button
                  onClick={() => {
                    applyTheme('midnight');
                    addNotification({ type: 'success', title: 'Theme Reset', message: 'Reset to Midnight (default).', duration: 3000 });
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors">
                  Reset to Default
                </button>
              </div>
            </div>
          </div>

          {}
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 rounded-xl border border-slate-800">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: theme.accentPrimary }} />
            <p className="text-sm text-white font-semibold capitalize">{theme.preset} theme</p>
            <p className="text-xs text-slate-500 ml-auto">
              {theme.preset === 'custom' ? 'Custom · saved to browser' : 'Built-in preset'}
            </p>
          </div>

        </div>
      </SectionCard>
    </div>
  );
}
export default Settings;
