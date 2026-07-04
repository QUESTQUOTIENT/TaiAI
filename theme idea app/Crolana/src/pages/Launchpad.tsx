import { createStaticRpcProvider } from '../lib/rpc';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { useAppStore } from '../store';
import {
  Rocket, Search, CheckCircle, XCircle, AlertTriangle, ExternalLink,
  Copy, RefreshCw, Zap, Users, Coins, BarChart3, Play, Pause,
  Settings2, Globe, Link as LinkIcon, Image, ArrowRight, Loader2,
  Shield, Sparkles, Clock, TrendingUp, Hash, ChevronDown, ChevronUp,
  Wallet, Star, Eye, EyeOff, Download,
} from 'lucide-react';


const NFT_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function maxSupply() view returns (uint256)',
  'function cost() view returns (uint256)',
  'function maxMintAmountPerTx() view returns (uint256)',
  'function paused() view returns (bool)',
  'function revealed() view returns (bool)',
  'function baseURI() view returns (string)',
  'function hiddenMetadataUri() view returns (string)',
  'function contractURI() view returns (string)',
  'function balanceOf(address owner) view returns (uint256)',
  'function owner() view returns (address)',
  'function mint(uint256 _mintAmount) external payable',
  'function setPaused(bool _state) external',
  'function setCost(uint256 _newCost) external',
  'function setMaxMintAmountPerTx(uint256 _newMax) external',
  'function withdraw() external payable',
  'function setBaseURI(string memory _newBaseURI) external',
];

interface ContractInfo {
  address: string;
  name: string;
  symbol: string;
  totalSupply: number;
  maxSupply: number;
  cost: bigint;
  maxPerTx: number;
  paused: boolean;
  revealed: boolean;
  baseURI: string;
  hiddenURI: string;
  contractURI: string;
  ownerAddress: string;
  contractBalance: bigint;
  userBalance: number;
}

type ViewMode = 'connect' | 'manage' | 'mint';


const fmt = (val: bigint, decimals = 18, precision = 4) =>
  parseFloat(ethers.formatUnits(val, decimals)).toFixed(precision).replace(/\.?0+$/, '');

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);


export function Launchpad() {
  const { walletAddress, network, addNotification, updateNotification, deployedAddress } = useAppStore();

  const [contractAddress, setContractAddress] = useState(deployedAddress || '');
  const [info, setInfo] = useState<ContractInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<ViewMode>('connect');
  const [mintAmount, setMintAmount] = useState(1);
  const [isMinting, setIsMinting] = useState(false);
  const [lastTx, setLastTx] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  
  const [newCost, setNewCost] = useState('');
  const [newMax, setNewMax] = useState('');
  const [newBaseURI, setNewBaseURI] = useState('');
  const [isSaving, setIsSaving] = useState<string | null>(null);

  
  useEffect(() => {
    if (deployedAddress && !info) {
      setContractAddress(deployedAddress);
    }
  }, [deployedAddress]);

  const loadContract = useCallback(async (addr?: string) => {
    const target = addr || contractAddress;
    if (!target.trim() || !ethers.isAddress(target.trim())) {
      addNotification({ type: 'error', title: 'Invalid Address', message: 'Enter a valid 0x… contract address.', duration: 4000 });
      return;
    }
    setIsLoading(true);
    setInfo(null);
    try {
      const provider = createStaticRpcProvider(network.chainId);

      const contract = new ethers.Contract(target.trim(), NFT_ABI, provider);

      const results = await Promise.allSettled([
        contract.name(),
        contract.symbol(),
        contract.totalSupply(),
        contract.maxSupply(),
        contract.cost(),
        contract.maxMintAmountPerTx(),
        contract.paused(),
        contract.revealed(),
        contract.baseURI(),
        contract.hiddenMetadataUri(),
        contract.contractURI(),
        contract.owner(),
        provider.getBalance(target.trim()),
        walletAddress ? contract.balanceOf(walletAddress) : Promise.resolve(0n),
      ]);

      const g = (r: PromiseSettledResult<any>, fallback: any) =>
        r.status === 'fulfilled' ? r.value : fallback;

      const loaded: ContractInfo = {
        address: target.trim(),
        name:          g(results[0],  'Unknown Collection'),
        symbol:        g(results[1],  '???'),
        totalSupply:   Number(g(results[2],  0n)),
        maxSupply:     Number(g(results[3],  0n)),
        cost:          g(results[4],  0n),
        maxPerTx:      Number(g(results[5],  5n)),
        paused:        g(results[6],  false),
        revealed:      g(results[7],  false),
        baseURI:       g(results[8],  ''),
        hiddenURI:     g(results[9],  ''),
        contractURI:   g(results[10], ''),
        ownerAddress:  g(results[11], ''),
        contractBalance: g(results[12], 0n),
        userBalance:   Number(g(results[13], 0n)),
      };

      setInfo(loaded);
      setIsOwner(!!walletAddress && loaded.ownerAddress.toLowerCase() === walletAddress.toLowerCase());
      setView('mint');
      addNotification({ type: 'success', title: `Loaded: ${loaded.name}`, message: `${loaded.totalSupply}/${loaded.maxSupply} minted`, duration: 3000 });
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Failed to Load', message: err.message || 'Check the address and network.', duration: 6000 });
    } finally {
      setIsLoading(false);
    }
  }, [contractAddress, walletAddress, network.rpcUrl]);

  const handleMint = async () => {
    if (!info || !walletAddress || !(window as any).ethereum) return;
    setIsMinting(true);
    const notifId = addNotification({ type: 'loading', title: 'Confirm Mint', message: `Minting ${mintAmount} NFT${mintAmount > 1 ? 's' : ''}…`, duration: 0 });
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const net = await provider.getNetwork();
      if (Number(net.chainId) !== network.chainId)
        throw new Error(`Wrong network — switch to ${network.name}`);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(info.address, NFT_ABI, signer);
      const value = info.cost * BigInt(mintAmount);
      const tx = await contract.mint(mintAmount, { value });
      updateNotification(notifId, { type: 'loading', title: 'Minting…', message: `TX: ${tx.hash.slice(0, 12)}…`, duration: 0 });
      await tx.wait();
      setLastTx(tx.hash);
      updateNotification(notifId, { type: 'success', title: `🎉 Minted ${mintAmount} NFT${mintAmount > 1 ? 's' : ''}!`, message: `TX: ${tx.hash.slice(0, 12)}…`, duration: 8000 });
      loadContract(info.address);
    } catch (err: any) {
      const rejected = err.code === 4001 || err.code === 'ACTION_REJECTED';
      updateNotification(notifId, {
        type: rejected ? 'info' : 'error',
        title: rejected ? 'Cancelled' : 'Mint Failed',
        message: rejected ? 'Rejected in wallet.' : (err.reason || err.shortMessage || err.message || 'Unknown error'),
        duration: 5000,
      });
    } finally {
      setIsMinting(false);
    }
  };

  const ownerAction = async (label: string, fn: (contract: ethers.Contract) => Promise<ethers.TransactionResponse>) => {
    if (!info || !(window as any).ethereum) return;
    setIsSaving(label);
    const notifId = addNotification({ type: 'loading', title: label, message: 'Confirm in wallet…', duration: 0 });
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(info.address, NFT_ABI, signer);
      const tx = await fn(contract);
      updateNotification(notifId, { type: 'loading', title: label, message: `TX: ${tx.hash.slice(0, 12)}…`, duration: 0 });
      await tx.wait();
      updateNotification(notifId, { type: 'success', title: `${label} — Done!`, message: '', duration: 5000 });
      await loadContract(info.address);
    } catch (err: any) {
      const rejected = err.code === 4001 || err.code === 'ACTION_REJECTED';
      updateNotification(notifId, {
        type: rejected ? 'info' : 'error',
        title: rejected ? 'Cancelled' : 'Failed',
        message: rejected ? 'Rejected.' : (err.reason || err.message || 'Failed'),
        duration: 5000,
      });
    } finally {
      setIsSaving(null);
    }
  };

  const mintPct = info ? pct(info.totalSupply, info.maxSupply) : 0;
  const formattedCost = info
    ? info.cost === 0n ? 'FREE' : `${fmt(info.cost)} ${network.symbol}`
    : '—';

  
  if (view === 'connect' || !info) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Rocket className="w-5 h-5 text-white" />
            </div>
            Universal Launchpad
          </h1>
          <p className="text-slate-400 text-sm mt-2">Connect any Cronos NFT contract to manage and launch community minting — whether you built it here or deployed it elsewhere.</p>
        </div>

        {}
        <div className="max-w-2xl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Search className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Connect NFT Contract</h2>
                <p className="text-sm text-slate-400">Enter any ERC-721 or ERC-721A contract address on {network.name}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Contract Address</label>
                <div className="flex gap-3">
                  <input
                    value={contractAddress}
                    onChange={(e) => setContractAddress(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadContract()}
                    placeholder="0x…"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all placeholder-slate-600"
                  />
                  <button
                    onClick={() => loadContract()}
                    disabled={isLoading || !contractAddress.trim()}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2 disabled:cursor-not-allowed"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                    {isLoading ? 'Loading…' : 'Load'}
                  </button>
                </div>
              </div>

              {}
              {deployedAddress && (
                <button
                  onClick={() => { setContractAddress(deployedAddress); loadContract(deployedAddress); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-500/10 border border-green-500/20 hover:border-green-500/40 text-green-400 rounded-xl text-sm font-semibold transition-all w-full"
                >
                  <CheckCircle className="w-4 h-4" />
                  Load my deployed contract: {deployedAddress.slice(0, 10)}…{deployedAddress.slice(-6)}
                  <ArrowRight className="w-4 h-4 ml-auto" />
                </button>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-slate-800">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">What you can do</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Zap,      label: 'Launch public mint',   desc: 'Set price, supply, phase' },
                  { icon: Users,    label: 'Community minting',    desc: 'Anyone can mint your NFTs' },
                  { icon: Settings2,label: 'Owner controls',       desc: 'Pause, reveal, withdraw' },
                  { icon: BarChart3,label: 'Live stats',           desc: 'Track mint progress' },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="flex items-start gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800/50">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-white text-xs font-semibold">{label}</p>
                      <p className="text-slate-500 text-[11px] mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  
  return (
    <div className="space-y-6">
      {}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-900/30">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-black text-white">{info.name}</h1>
              <span className="text-sm font-bold text-slate-500 font-mono">{info.symbol}</span>
              {isOwner && (
                <span className="flex items-center gap-1 text-[10px] bg-yellow-500/15 text-yellow-400 border border-yellow-500/25 px-2 py-0.5 rounded-full font-bold">
                  <Star className="w-3 h-3" /> OWNER
                </span>
              )}
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${info.paused ? 'bg-red-500/15 text-red-400 border border-red-500/25' : 'bg-green-500/15 text-green-400 border border-green-500/25'}`}>
                {info.paused ? '⏸ PAUSED' : '● LIVE'}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-slate-500 text-xs font-mono">{info.address.slice(0, 10)}…{info.address.slice(-6)}</span>
              <button onClick={() => { navigator.clipboard.writeText(info.address); addNotification({ type: 'success', title: 'Copied', message: '', duration: 2000 }); }}>
                <Copy className="w-3 h-3 text-slate-600 hover:text-slate-300" />
              </button>
              <a href={`${network.explorerUrl}/address/${info.address}`} target="_blank" rel="noreferrer">
                <ExternalLink className="w-3 h-3 text-slate-600 hover:text-blue-400" />
              </a>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => loadContract(info.address)} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => { setInfo(null); setView('connect'); setContractAddress(''); }}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold transition-colors">
            Change Contract
          </button>
        </div>
      </div>

      {}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: Hash, color: 'blue', label: 'Minted',
            value: `${info.totalSupply.toLocaleString()} / ${info.maxSupply.toLocaleString()}`,
            sub: `${mintPct}% complete`,
            extra: (
              <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${mintPct}%` }} />
              </div>
            ),
          },
          {
            icon: Coins, color: 'purple', label: 'Mint Price',
            value: formattedCost,
            sub: info.cost > 0n ? `${fmt(info.cost * BigInt(info.maxPerTx))} max per tx` : 'No cost',
          },
          {
            icon: TrendingUp, color: 'green', label: 'Contract Balance',
            value: `${fmt(info.contractBalance)} ${network.symbol}`,
            sub: 'Raised from mints',
          },
          {
            icon: Wallet, color: 'orange', label: 'Your Holdings',
            value: walletAddress ? `${info.userBalance} NFTs` : 'Not connected',
            sub: walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : 'Connect wallet',
          },
        ].map(({ icon: Icon, color, label, value, sub, extra }) => (
          <div key={label} className={`bg-slate-900 p-4 rounded-xl border border-${color}-500/15 hover:border-${color}-500/30 transition-colors`}>
            <div className={`w-8 h-8 rounded-lg bg-${color}-500/10 flex items-center justify-center mb-3`}>
              <Icon className={`w-4 h-4 text-${color}-400`} />
            </div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{label}</p>
            <p className="text-lg font-black text-white mt-0.5 leading-tight">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
            {extra}
          </div>
        ))}
      </div>

      {}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
            {}
            <div className="p-6 pb-5 relative" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)' }}>
              <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-black text-white">Community Mint</h2>
                  {info.revealed
                    ? <span className="flex items-center gap-1 text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full font-bold"><Eye className="w-3 h-3" /> REVEALED</span>
                    : <span className="flex items-center gap-1 text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full font-bold"><EyeOff className="w-3 h-3" /> HIDDEN</span>
                  }
                </div>
                {}
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-slate-400 mb-2">
                    <span>{info.totalSupply.toLocaleString()} minted</span>
                    <span>{(info.maxSupply - info.totalSupply).toLocaleString()} remaining</span>
                  </div>
                  <div className="h-3 bg-black/30 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${mintPct}%`, background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                    <span>0</span>
                    <span className="font-bold text-blue-400">{mintPct}%</span>
                    <span>{info.maxSupply.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Price',    value: formattedCost },
                  { label: 'Max/Tx',  value: String(info.maxPerTx) },
                  { label: 'Yours',   value: walletAddress ? String(info.userBalance) : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-center">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
                    <p className="text-base font-black text-white mt-0.5">{value}</p>
                  </div>
                ))}
              </div>

              {}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">Mint Amount</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setMintAmount(Math.max(1, mintAmount - 1))}
                    className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black text-lg transition-colors flex items-center justify-center">−</button>
                  <div className="flex-1 text-center">
                    <span className="text-2xl font-black text-white">{mintAmount}</span>
                    {info.cost > 0n && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        Total: {fmt(info.cost * BigInt(mintAmount))} {network.symbol}
                      </p>
                    )}
                  </div>
                  <button onClick={() => setMintAmount(Math.min(info.maxPerTx, mintAmount + 1))}
                    className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black text-lg transition-colors flex items-center justify-center">+</button>
                </div>
                <div className="flex gap-2 mt-2">
                  {[1, 2, 5, info.maxPerTx].filter((v, i, arr) => arr.indexOf(v) === i && v <= info.maxPerTx).map((n) => (
                    <button key={n} onClick={() => setMintAmount(n)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${mintAmount === n ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                      {n === info.maxPerTx && n !== 1 ? `Max (${n})` : n}
                    </button>
                  ))}
                </div>
              </div>

              {}
              {!walletAddress ? (
                <div className="p-4 bg-yellow-500/8 border border-yellow-500/20 rounded-xl text-center">
                  <Wallet className="w-5 h-5 text-yellow-400 mx-auto mb-2" />
                  <p className="text-sm text-yellow-300 font-semibold">Connect your wallet to mint</p>
                  <p className="text-xs text-yellow-400/60 mt-1">Use the Connect button in the header</p>
                </div>
              ) : info.paused ? (
                <div className="p-4 bg-red-500/8 border border-red-500/20 rounded-xl text-center">
                  <Pause className="w-5 h-5 text-red-400 mx-auto mb-2" />
                  <p className="text-sm text-red-300 font-semibold">Minting is currently paused</p>
                  {isOwner && <p className="text-xs text-red-400/60 mt-1">Use owner controls to resume</p>}
                </div>
              ) : info.totalSupply >= info.maxSupply && info.maxSupply > 0 ? (
                <div className="p-4 bg-slate-800 rounded-xl text-center">
                  <CheckCircle className="w-5 h-5 text-green-400 mx-auto mb-2" />
                  <p className="text-sm text-white font-semibold">Sold Out!</p>
                  <p className="text-xs text-slate-400 mt-1">All {info.maxSupply} NFTs have been minted</p>
                </div>
              ) : (
                <button
                  onClick={handleMint}
                  disabled={isMinting}
                  className="w-full py-4 rounded-xl font-black text-white text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] shadow-lg shadow-blue-900/30"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
                >
                  {isMinting
                    ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Minting…</span>
                    : <span className="flex items-center justify-center gap-2"><Zap className="w-5 h-5" /> Mint {mintAmount} NFT{mintAmount > 1 ? 's' : ''}</span>
                  }
                </button>
              )}

              {}
              {lastTx && (
                <a href={`${network.explorerUrl}/tx/${lastTx}`} target="_blank" rel="noreferrer"
                  className="flex items-center justify-between p-3 bg-green-500/8 border border-green-500/20 rounded-xl text-xs group hover:border-green-500/40 transition-colors">
                  <div className="flex items-center gap-2 text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    <span className="font-semibold">Last mint confirmed</span>
                  </div>
                  <span className="text-green-400/60 group-hover:text-green-400 flex items-center gap-1 font-mono">
                    {lastTx.slice(0, 10)}… <ExternalLink className="w-3 h-3" />
                  </span>
                </a>
              )}
            </div>
          </div>
        </div>

        {}
        <div className="lg:col-span-2 space-y-4">

          {}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-400" /> Contract Info
            </h3>
            <div className="space-y-2.5 text-xs">
              {[
                { label: 'Network',  value: network.name },
                { label: 'Revealed', value: info.revealed ? '✅ Yes' : '⏳ No' },
                { label: 'Status',   value: info.paused ? '⏸ Paused' : '▶ Active' },
                { label: 'Owner',    value: info.ownerAddress ? `${info.ownerAddress.slice(0, 8)}…${info.ownerAddress.slice(-4)}` : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center py-1.5 border-b border-slate-800/60 last:border-0">
                  <span className="text-slate-500">{label}</span>
                  <span className="text-white font-semibold">{value}</span>
                </div>
              ))}
            </div>
            <a href={`${network.explorerUrl}/address/${info.address}`} target="_blank" rel="noreferrer"
              className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold transition-colors">
              View on Explorer <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {}
          {isOwner && (
            <div className="bg-slate-900 rounded-xl border border-yellow-500/20 p-5">
              <button onClick={() => setShowSettings(!showSettings)}
                className="flex items-center justify-between w-full mb-1">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-400" /> Owner Controls
                </h3>
                {showSettings ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              <p className="text-[10px] text-slate-500 mb-4">Only visible to contract owner</p>

              {showSettings && (
                <div className="space-y-4">
                  {}
                  <div className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <div>
                      <p className="text-xs font-semibold text-white">Minting</p>
                      <p className="text-[10px] text-slate-500">{info.paused ? 'Currently paused' : 'Open for minting'}</p>
                    </div>
                    <button
                      onClick={() => ownerAction(info.paused ? 'Unpausing…' : 'Pausing…', (c) => c.setPaused(!info.paused))}
                      disabled={isSaving !== null}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${info.paused ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30'}`}
                    >
                      {isSaving === (info.paused ? 'Unpausing…' : 'Pausing…')
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : info.paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                      {info.paused ? 'Unpause' : 'Pause'}
                    </button>
                  </div>

                  {}
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                      Mint Price (current: {formattedCost})
                    </label>
                    <div className="flex gap-2">
                      <input value={newCost} onChange={(e) => setNewCost(e.target.value)} placeholder={fmt(info.cost)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-blue-500 outline-none" />
                      <button
                        disabled={!newCost || isSaving !== null}
                        onClick={() => ownerAction('Setting Price…', (c) => c.setCost(ethers.parseEther(newCost || '0')))}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-colors">
                        {isSaving === 'Setting Price…' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Set'}
                      </button>
                    </div>
                  </div>

                  {}
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                      Max Per Tx (current: {info.maxPerTx})
                    </label>
                    <div className="flex gap-2">
                      <input value={newMax} onChange={(e) => setNewMax(e.target.value)} placeholder={String(info.maxPerTx)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-blue-500 outline-none" />
                      <button
                        disabled={!newMax || isSaving !== null}
                        onClick={() => ownerAction('Setting Max…', (c) => c.setMaxMintAmountPerTx(parseInt(newMax)))}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-colors">
                        {isSaving === 'Setting Max…' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Set'}
                      </button>
                    </div>
                  </div>

                  {}
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                      Base URI
                    </label>
                    <div className="flex gap-2">
                      <input value={newBaseURI} onChange={(e) => setNewBaseURI(e.target.value)} placeholder="ipfs://…"
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-blue-500 outline-none font-mono" />
                      <button
                        disabled={!newBaseURI || isSaving !== null}
                        onClick={() => ownerAction('Setting URI…', (c) => c.setBaseURI(newBaseURI))}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-colors">
                        {isSaving === 'Setting URI…' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Set'}
                      </button>
                    </div>
                  </div>

                  {}
                  <button
                    disabled={info.contractBalance === 0n || isSaving !== null}
                    onClick={() => ownerAction('Withdrawing…', (c) => c.withdraw())}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-sm font-black transition-colors flex items-center justify-center gap-2"
                  >
                    {isSaving === 'Withdrawing…' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Withdraw {fmt(info.contractBalance)} {network.symbol}
                  </button>
                </div>
              )}
            </div>
          )}

          {}
          {walletAddress && !isOwner && (
            <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 text-center">
              <Shield className="w-5 h-5 text-slate-500 mx-auto mb-2" />
              <p className="text-xs text-slate-500 font-semibold">Owner controls hidden</p>
              <p className="text-[10px] text-slate-600 mt-1">Connect as the contract owner to manage this collection</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default Launchpad;
