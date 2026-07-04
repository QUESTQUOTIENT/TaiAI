import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { getReadProvider } from '../../lib/provider';
import { useAppStore } from '../../store';
import {
  Globe, Copy, ExternalLink, Zap, Image, RefreshCw, CheckCircle,
  Users, Coins, BarChart3, AlertTriangle, Play, Pause, Eye, EyeOff,
  Link as LinkIcon, Download, Settings2,
} from 'lucide-react';

const MINT_ABI = [
  'function mint(uint256 _mintAmount) external payable',
  'function cost() view returns (uint256)',
  'function maxSupply() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function maxMintAmountPerTx() view returns (uint256)',
  'function paused() view returns (bool)',
  'function revealed() view returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function setPaused(bool _state) external',
];

interface MintZoneConfig {
  collectionName: string;
  description: string;
  bannerColor: string;
  accentColor: string;
  logoUrl: string;
  websiteUrl: string;
  twitterUrl: string;
  discordUrl: string;
  showCountdown: boolean;
  countdownTo: string;
  customMessage: string;
  maxPerWallet: number;
}

interface LiveData {
  name: string;
  symbol: string;
  totalSupply: number;
  maxSupply: number;
  cost: bigint;
  maxPerTx: number;
  paused: boolean;
  revealed: boolean;
  userBalance: number;
}

export function MintZone() {
  const { deployedAddress, network, walletAddress, addNotification, updateNotification, advancedContractConfig } = useAppStore();

  const [config, setConfig] = useState<MintZoneConfig>({
    collectionName: advancedContractConfig.name || 'My NFT Collection',
    description: 'Join our exclusive NFT collection on Cronos. Limited supply — mint yours today!',
    bannerColor: '#0f172a',
    accentColor: '#3b82f6',
    logoUrl: '',
    websiteUrl: '',
    twitterUrl: '',
    discordUrl: '',
    showCountdown: false,
    countdownTo: '',
    customMessage: '',
    maxPerWallet: 5,
  });

  const [liveData, setLiveData] = useState<LiveData | null>(null);
  const [isLoadingLive, setIsLoadingLive] = useState(false);
  const [mintAmount, setMintAmount] = useState(1);
  const [isMinting, setIsMinting] = useState(false);
  const [activeView, setActiveView] = useState<'config' | 'preview' | 'live'>('config');
  const [pageUrl, setPageUrl] = useState('');
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);

  
  const fetchLiveData = useCallback(async () => {
    if (!deployedAddress || !(window as any).ethereum) return;
    setIsLoadingLive(true);
    try {
      const provider = getReadProvider(network.chainId);
      const contract = new ethers.Contract(deployedAddress, MINT_ABI, provider);

      const results = await Promise.allSettled([
        contract.name(),
        contract.symbol(),
        contract.totalSupply(),
        contract.maxSupply(),
        contract.cost(),
        contract.maxMintAmountPerTx(),
        contract.paused(),
        contract.revealed(),
        walletAddress ? contract.balanceOf(walletAddress) : Promise.resolve(0n),
      ]);

      const get = (r: PromiseSettledResult<any>, fallback: any) =>
        r.status === 'fulfilled' ? r.value : fallback;

      setLiveData({
        name:        get(results[0], config.collectionName),
        symbol:      get(results[1], ''),
        totalSupply: Number(get(results[2], 0n)),
        maxSupply:   Number(get(results[3], 0n)),
        cost:        get(results[4], 0n),
        maxPerTx:    Number(get(results[5], 5n)),
        paused:      get(results[6], false),
        revealed:    get(results[7], false),
        userBalance: Number(get(results[8], 0n)),
      });
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Could not read contract', message: err.message, duration: 4000 });
    } finally {
      setIsLoadingLive(false);
    }
  }, [deployedAddress, walletAddress, config.collectionName]);

  useEffect(() => {
    if (deployedAddress) fetchLiveData();
  }, [deployedAddress, fetchLiveData]);

  const handleMint = async () => {
    if (!walletAddress || !(window as any).ethereum || !deployedAddress || !liveData) return;
    setIsMinting(true);
    const notifId = addNotification({ type: 'loading', title: 'Confirm Mint', message: `Minting ${mintAmount} NFT${mintAmount > 1 ? 's' : ''}…`, duration: 0 });
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const net = await provider.getNetwork();
      if (Number(net.chainId) !== network.chainId) {
        throw new Error(`Wrong network — please switch to ${network.name}`);
      }
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(deployedAddress, MINT_ABI, signer);
      const totalCost = liveData.cost * BigInt(mintAmount);
      const tx = await contract.mint(mintAmount, { value: totalCost });
      updateNotification(notifId, { type: 'loading', title: 'Minting…', message: `TX: ${tx.hash.slice(0, 10)}… — waiting for confirmation`, duration: 0 });
      await tx.wait();
      updateNotification(notifId, { type: 'success', title: '🎉 Minted!', message: `Successfully minted ${mintAmount} NFT${mintAmount > 1 ? 's' : ''}!`, duration: 8000 });
      fetchLiveData();
    } catch (err: any) {
      const isRejected = err.code === 4001 || err.code === 'ACTION_REJECTED';
      if (isRejected) {
        updateNotification(notifId, { type: 'info', title: 'Mint Cancelled', message: 'Rejected in wallet.', duration: 3000 });
      } else {
        const msg = err.reason || err.shortMessage || err.message || 'Mint failed';
        updateNotification(notifId, { type: 'error', title: 'Mint Failed', message: msg, duration: 8000 });
      }
    } finally {
      setIsMinting(false);
    }
  };

  const handleTogglePause = async () => {
    if (!deployedAddress || !(window as any).ethereum || !liveData) return;
    const notifId = addNotification({ type: 'loading', title: liveData.paused ? 'Unpausing…' : 'Pausing…', message: 'Confirm in wallet', duration: 0 });
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(deployedAddress, MINT_ABI, signer);
      const tx = await contract.setPaused(!liveData.paused);
      await tx.wait();
      updateNotification(notifId, { type: 'success', title: liveData.paused ? 'Minting Unpaused' : 'Minting Paused', message: `Contract is now ${liveData.paused ? 'open for minting' : 'paused'}`, duration: 5000 });
      fetchLiveData();
    } catch (err: any) {
      const msg = err.reason || err.message || 'Failed';
      updateNotification(notifId, { type: 'error', title: 'Transaction Failed', message: msg, duration: 6000 });
    }
    setShowPauseConfirm(false);
  };

  const generateShareUrl = () => {
    const params = new URLSearchParams({
      contract: deployedAddress || '',
      chain: String(network.chainId),
      name: config.collectionName,
      accent: config.accentColor.replace('#', ''),
    });
    
    params.set('chain', String(network.chainId));
    const url = `${window.location.origin}/mint?${params.toString()}`;
    setPageUrl(url);
    navigator.clipboard.writeText(url);
    addNotification({ type: 'success', title: 'Mint URL Copied!', message: 'Share this link so your community can mint.', duration: 4000 });
  };

  const mintPercent = liveData && liveData.maxSupply > 0
    ? Math.round((liveData.totalSupply / liveData.maxSupply) * 100)
    : 0;

  const formattedCost = liveData
    ? liveData.cost === 0n
      ? 'FREE'
      : `${parseFloat(ethers.formatEther(liveData.cost)).toFixed(4)} ${network.symbol}`
    : '—';

  
  const PreviewCard = () => (
    <div className="rounded-2xl overflow-hidden border border-slate-700 shadow-2xl max-w-sm mx-auto"
      style={{ background: config.bannerColor }}>
      {}
      <div className="h-28 flex items-center justify-center relative"
        style={{ background: `linear-gradient(135deg, ${config.accentColor}33, ${config.accentColor}11)` }}>
        {config.logoUrl
          ? <img src={config.logoUrl} alt="Logo" className="h-20 w-20 rounded-full object-cover border-2 border-white/20" />
          : <div className="h-20 w-20 rounded-full flex items-center justify-center border-2 border-white/10"
              style={{ background: `${config.accentColor}44` }}>
              <Image className="w-8 h-8 text-white/40" />
            </div>
        }
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          {liveData?.paused
            ? <span className="text-[10px] bg-red-500/30 text-red-300 border border-red-500/40 px-2 py-0.5 rounded-full font-bold">PAUSED</span>
            : <span className="text-[10px] bg-green-500/30 text-green-300 border border-green-500/40 px-2 py-0.5 rounded-full font-bold">● LIVE</span>
          }
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div>
          <h2 className="text-xl font-black text-white">{config.collectionName}</h2>
          <p className="text-sm text-slate-400 mt-1 leading-relaxed">{config.description}</p>
          {config.customMessage && (
            <div className="mt-3 p-2.5 rounded-lg text-xs text-white/80 border"
              style={{ borderColor: `${config.accentColor}44`, background: `${config.accentColor}11` }}>
              {config.customMessage}
            </div>
          )}
        </div>

        {}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Price',   value: formattedCost },
            { label: 'Minted',  value: liveData ? `${liveData.totalSupply}/${liveData.maxSupply}` : '—' },
            { label: 'Yours',   value: liveData ? String(liveData.userBalance) : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="p-2 rounded-lg" style={{ background: `${config.accentColor}11`, border: `1px solid ${config.accentColor}22` }}>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
              <p className="text-sm font-bold text-white mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {}
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>{mintPercent}% minted</span>
            <span>{liveData ? liveData.maxSupply - liveData.totalSupply : '—'} remaining</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${mintPercent}%`, background: config.accentColor }} />
          </div>
        </div>

        {}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs text-slate-400">Amount</span>
            <div className="flex items-center gap-2 flex-1">
              <button onClick={() => setMintAmount(Math.max(1, mintAmount - 1))}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors text-sm">−</button>
              <span className="flex-1 text-center text-white font-bold">{mintAmount}</span>
              <button onClick={() => setMintAmount(Math.min(liveData?.maxPerTx || 5, mintAmount + 1))}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors text-sm">+</button>
            </div>
            <span className="text-xs text-slate-500">max {liveData?.maxPerTx || config.maxPerWallet}</span>
          </div>

          {liveData && liveData.cost > 0n && (
            <p className="text-xs text-slate-500 mb-2 text-center">
              Total: {parseFloat(ethers.formatEther(liveData.cost * BigInt(mintAmount))).toFixed(4)} {network.symbol}
            </p>
          )}

          <button onClick={handleMint}
            disabled={isMinting || liveData?.paused || !walletAddress}
            className="w-full py-3 rounded-xl font-black text-white text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            style={{ background: liveData?.paused ? '#64748b' : config.accentColor }}>
            {isMinting ? 'Minting…' : liveData?.paused ? '⏸ Minting Paused' : !walletAddress ? 'Connect Wallet' : `Mint ${mintAmount} NFT${mintAmount > 1 ? 's' : ''}`}
          </button>
        </div>

        {}
        {(config.websiteUrl || config.twitterUrl || config.discordUrl) && (
          <div className="flex gap-2 justify-center pt-1">
            {config.websiteUrl && <a href={config.websiteUrl} target="_blank" rel="noreferrer"
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"><Globe className="w-3 h-3" /> Website</a>}
            {config.twitterUrl && <a href={config.twitterUrl} target="_blank" rel="noreferrer"
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"><LinkIcon className="w-3 h-3" /> Twitter</a>}
            {config.discordUrl && <a href={config.discordUrl} target="_blank" rel="noreferrer"
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"><LinkIcon className="w-3 h-3" /> Discord</a>}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <Globe className="w-6 h-6 text-blue-500" />
            Mint Zone
          </h2>
          <p className="text-slate-400 text-sm mt-1">Create a public minting page your community can use to mint NFTs.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchLiveData} disabled={isLoadingLive}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors">
            <RefreshCw className={`w-4 h-4 ${isLoadingLive ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {}
      <div className="flex bg-slate-900 rounded-xl border border-slate-800 p-1 gap-1">
        {[
          { id: 'config',  label: '⚙️ Configure' },
          { id: 'preview', label: '👁 Preview' },
          { id: 'live',    label: '📊 Live Stats' },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => setActiveView(id as any)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${activeView === id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {}
      {activeView === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-5">
            <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-4">
              <h3 className="text-white font-bold flex items-center gap-2"><Settings2 className="w-4 h-4 text-blue-400" /> Collection Info</h3>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Collection Name</label>
                <input value={config.collectionName} onChange={(e) => setConfig(p => ({ ...p, collectionName: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
                <textarea value={config.description} onChange={(e) => setConfig(p => ({ ...p, description: e.target.value }))} rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Banner Message (optional)</label>
                <input value={config.customMessage} onChange={(e) => setConfig(p => ({ ...p, customMessage: e.target.value }))}
                  placeholder="🔥 Genesis collection — only 1000 supply!"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Logo / Image URL (optional)</label>
                <input value={config.logoUrl} onChange={(e) => setConfig(p => ({ ...p, logoUrl: e.target.value }))}
                  placeholder="https://... or ipfs://..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
              </div>
            </div>

            <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-4">
              <h3 className="text-white font-bold">🎨 Appearance</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Background Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={config.bannerColor} onChange={(e) => setConfig(p => ({ ...p, bannerColor: e.target.value }))}
                      className="w-10 h-10 rounded-lg border border-slate-700 cursor-pointer bg-transparent" />
                    <input value={config.bannerColor} onChange={(e) => setConfig(p => ({ ...p, bannerColor: e.target.value }))}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-blue-500 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Accent Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={config.accentColor} onChange={(e) => setConfig(p => ({ ...p, accentColor: e.target.value }))}
                      className="w-10 h-10 rounded-lg border border-slate-700 cursor-pointer bg-transparent" />
                    <input value={config.accentColor} onChange={(e) => setConfig(p => ({ ...p, accentColor: e.target.value }))}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-blue-500 outline-none" />
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 mb-2">Quick Themes</p>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { bg: '#0f172a', accent: '#3b82f6', label: 'Ocean' },
                    { bg: '#1a0a2e', accent: '#a855f7', label: 'Cosmic' },
                    { bg: '#0a1628', accent: '#22c55e', label: 'Matrix' },
                    { bg: '#1c0a0a', accent: '#ef4444', label: 'Flame' },
                    { bg: '#0a1c1a', accent: '#14b8a6', label: 'Teal' },
                    { bg: '#1a1a0a', accent: '#f59e0b', label: 'Gold' },
                  ].map(({ bg, accent, label }) => (
                    <button key={label}
                      onClick={() => setConfig(p => ({ ...p, bannerColor: bg, accentColor: accent }))}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors text-xs text-slate-300">
                      <span className="w-4 h-4 rounded-full border border-white/20" style={{ background: accent }} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-4">
              <h3 className="text-white font-bold">🔗 Social Links</h3>
              {[
                { key: 'websiteUrl',  label: 'Website URL',  placeholder: 'https://myproject.io' },
                { key: 'twitterUrl', label: 'Twitter/X',     placeholder: 'https://twitter.com/...' },
                { key: 'discordUrl', label: 'Discord',       placeholder: 'https://discord.gg/...' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
                  <input value={(config as any)[key]} onChange={(e) => setConfig(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
                </div>
              ))}
            </div>

            {}
            {deployedAddress && (
              <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
                <h3 className="text-white font-bold mb-3">📄 Contract</h3>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-xs text-slate-300 flex items-center gap-2">
                  <span className="truncate flex-1">{deployedAddress}</span>
                  <button onClick={() => { navigator.clipboard.writeText(deployedAddress!); addNotification({ type: 'success', title: 'Copied', message: 'Address copied', duration: 2000 }); }}><Copy className="w-3.5 h-3.5 text-slate-400 hover:text-white" /></button>
                  <a href={`${network.explorerUrl}/address/${deployedAddress}`} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5 text-blue-400 hover:text-blue-300" /></a>
                </div>
                <p className="text-xs text-slate-500 mt-2">Chain: {network.name} (ID: {network.chainId})</p>
              </div>
            )}

            {}
            {walletAddress && liveData && (
              <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2"><Settings2 className="w-4 h-4 text-orange-400" /> Owner Controls</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <div>
                      <p className="text-sm text-white font-medium">Minting Status</p>
                      <p className="text-xs text-slate-500">{liveData.paused ? 'Currently paused' : 'Open for minting'}</p>
                    </div>
                    <button onClick={() => setShowPauseConfirm(true)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${liveData.paused ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30'}`}>
                      {liveData.paused ? <><Play className="w-3 h-3" /> Unpause</> : <><Pause className="w-3 h-3" /> Pause</>}
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <div>
                      <p className="text-sm text-white font-medium">Reveal State</p>
                      <p className="text-xs text-slate-500">{liveData.revealed ? 'NFTs revealed' : 'Hidden / unrevealed'}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded ${liveData.revealed ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      {liveData.revealed ? '● REVEALED' : '● HIDDEN'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {}
            <div className="bg-blue-600/10 border border-blue-500/20 p-5 rounded-xl">
              <h3 className="text-white font-bold mb-2">🚀 Share Your Mint Page</h3>
              <p className="text-sm text-slate-400 mb-4">Generate a shareable link your community can use to mint directly.</p>
              <button onClick={generateShareUrl}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
                <Copy className="w-4 h-4" /> Copy Mint Page URL
              </button>
              {pageUrl && (
                <div className="mt-3 p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                  <p className="text-xs text-slate-500 font-mono break-all">{pageUrl}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {}
      {activeView === 'preview' && (
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-xs text-slate-500 ml-2 font-mono">{window.location.host}/mint?contract={deployedAddress?.slice(0, 8)}…</span>
            </div>
            <PreviewCard />
          </div>
          <p className="text-center text-xs text-slate-500">This is what your community sees when they visit your mint page.</p>
        </div>
      )}

      {}
      {activeView === 'live' && (
        <div className="space-y-4">
          {!liveData ? (
            <div className="text-center py-16 text-slate-500">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No live data — make sure your contract is deployed and your wallet is connected.</p>
              <button onClick={fetchLiveData} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold">
                Load Data
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { icon: Coins,    label: 'Mint Price',     value: formattedCost,          color: 'blue' },
                  { icon: Users,    label: 'Total Minted',   value: `${liveData.totalSupply} / ${liveData.maxSupply}`, color: 'purple' },
                  { icon: BarChart3,label: 'Progress',       value: `${mintPercent}%`,       color: 'green' },
                  { icon: liveData.paused ? Pause : Play, label: 'Status', value: liveData.paused ? 'Paused' : 'Live', color: liveData.paused ? 'red' : 'green' },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div key={label} className={`bg-slate-900 p-4 rounded-xl border border-${color}-500/20`}>
                    <div className={`w-8 h-8 bg-${color}-500/10 rounded-lg flex items-center justify-center mb-3`}>
                      <Icon className={`w-4 h-4 text-${color}-400`} />
                    </div>
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="text-lg font-bold text-white">{value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
                <h3 className="text-white font-bold mb-4">Mint Progress</h3>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-400">{liveData.totalSupply} minted</span>
                  <span className="text-slate-400">{liveData.maxSupply - liveData.totalSupply} remaining</span>
                </div>
                <div className="h-4 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-1000"
                    style={{ width: `${mintPercent}%` }} />
                </div>
                <div className="flex justify-between text-xs text-slate-600 mt-1.5">
                  <span>0</span>
                  <span className="font-mono">{mintPercent}%</span>
                  <span>{liveData.maxSupply.toLocaleString()}</span>
                </div>
              </div>

              {walletAddress && (
                <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
                  <h3 className="text-white font-bold mb-3">Your Holdings</h3>
                  <div className="flex items-center gap-4 p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center">
                      <Image className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-white font-bold">{liveData.userBalance} NFT{liveData.userBalance !== 1 ? 's' : ''}</p>
                      <p className="text-xs text-slate-500">{walletAddress.slice(0, 8)}…{walletAddress.slice(-4)}</p>
                    </div>
                    <a href={`${network.explorerUrl}/address/${deployedAddress}`} target="_blank" rel="noreferrer"
                      className="ml-auto flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs">
                      View <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

              <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-bold">Try Minting Here</h3>
                  <button onClick={fetchLiveData} className="p-1.5 text-slate-500 hover:text-white bg-slate-800 rounded-lg">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                <PreviewCard />
              </div>
            </>
          )}
        </div>
      )}

      {}
      {showPauseConfirm && liveData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowPauseConfirm(false)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-bold text-lg mb-2">{liveData.paused ? 'Unpause Minting?' : 'Pause Minting?'}</h3>
            <p className="text-slate-400 text-sm mb-5">
              {liveData.paused
                ? 'This will allow your community to mint again.'
                : 'This will stop new mints. You can unpause at any time.'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowPauseConfirm(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors">Cancel</button>
              <button onClick={handleTogglePause}
                className={`flex-1 py-2.5 rounded-xl font-bold text-white transition-colors ${liveData.paused ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                {liveData.paused ? 'Unpause' : 'Pause'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
