

import React, { useState } from 'react';
import {
  Zap, Package, CheckCircle, ExternalLink, Loader2, AlertTriangle,
  Info, Image as ImageIcon, Settings, Copy, Globe,
} from 'lucide-react';
import { useAppStore } from '../store';
import { mintSolanaNft, deployCandyMachine, mintFromCandyMachine, type SolNftConfig, type CandyMachineConfig } from '../lib/solanaMetaplex';
import { cn } from '../lib/utils';
import { parseChainError } from '../lib/chainErrors';


async function trackTx(txHash: string, walletAddress: string, metadata?: Record<string, unknown>) {
  try {
    await fetch('/api/tx/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chain: 'solana', txHash, walletAddress, metadata }),
    });
  } catch {  }
}

type Mode = 'single' | 'candymachine' | 'mintfrom';

export function SolanaMinting() {
  const { solanaWalletAddress, network, addNotification, updateNotification } = useAppStore();
  const cluster = network.cluster ?? 'mainnet-beta';

  const [mode, setMode] = useState<Mode>('single');
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  
  const [singleConfig, setSingleConfig] = useState<SolNftConfig>({
    name: '', symbol: '', description: '', metadataUri: '',
    sellerFeeBasisPoints: 500, isMutable: true, cluster,
  });

  
  const [cmConfig, setCmConfig] = useState<CandyMachineConfig>({
    collectionName: '', symbol: '', description: '',
    sellerFeeBasisPoints: 500, itemsAvailable: 1000, price: 0.1,
    cluster,
  });

  
  const [cmAddress, setCmAddress] = useState('');
  const [collectionMint, setCollectionMint] = useState('');

  const handleSingleMint = async () => {
    if (!solanaWalletAddress) { setError('Connect Phantom wallet.'); return; }
    if (!singleConfig.metadataUri) { setError('Metadata URI is required. Upload your metadata JSON to IPFS first.'); return; }
    setError(null); setIsDeploying(true);
    const id = addNotification({ type: 'loading', title: 'Minting NFT…', message: singleConfig.name || 'Unnamed NFT', duration: 0 });
    try {
      const res = await mintSolanaNft({ ...singleConfig, cluster });
      setResult(res);
      updateNotification(id, { type: 'success', title: 'NFT Minted!', message: res.mintAddress.slice(0, 12) + '…' });
      
      if (res.txSignature) {
        trackTx(res.txSignature, solanaWalletAddress, { type: 'solana_mint', mintAddress: res.mintAddress });
      }
    } catch (err: any) {
      const parsed = parseChainError(err, 'solana');
      setError(parsed.suggestion ?? parsed.message);
      updateNotification(id, { type: 'error', title: parsed.title, message: parsed.message });
    } finally { setIsDeploying(false); }
  };

  const handleDeployCandyMachine = async () => {
    if (!solanaWalletAddress) { setError('Connect Phantom wallet.'); return; }
    setError(null); setIsDeploying(true);
    const id = addNotification({ type: 'loading', title: 'Deploying Candy Machine…', message: cmConfig.collectionName, duration: 0 });
    try {
      const res = await deployCandyMachine({ ...cmConfig, cluster });
      setResult(res);
      updateNotification(id, { type: 'success', title: 'Candy Machine Deployed!', message: res.candyMachineAddress.slice(0, 12) + '…' });
      if (res.txSignature) {
        trackTx(res.txSignature, solanaWalletAddress, { type: 'candy_machine_deploy', candyMachineAddress: res.candyMachineAddress });
      }
    } catch (err: any) {
      const parsed = parseChainError(err, 'solana');
      setError(parsed.suggestion ?? parsed.message);
      updateNotification(id, { type: 'error', title: parsed.title, message: parsed.message });
    } finally { setIsDeploying(false); }
  };

  const handleMintFromCM = async () => {
    if (!solanaWalletAddress) { setError('Connect Phantom wallet.'); return; }
    if (!cmAddress || !collectionMint) { setError('Candy Machine address and collection mint are required.'); return; }
    setError(null); setIsDeploying(true);
    const id = addNotification({ type: 'loading', title: 'Minting from Candy Machine…', message: cmAddress.slice(0, 8) + '…', duration: 0 });
    try {
      const res = await mintFromCandyMachine({ candyMachineAddress: cmAddress, collectionMint, cluster });
      setResult(res);
      updateNotification(id, { type: 'success', title: 'NFT Minted!', message: res.mintAddress.slice(0, 12) + '…' });
      if (res.txSignature) {
        trackTx(res.txSignature, solanaWalletAddress, { type: 'candy_machine_mint', mintAddress: res.mintAddress, candyMachine: cmAddress });
      }
    } catch (err: any) {
      const parsed = parseChainError(err, 'solana');
      setError(parsed.suggestion ?? parsed.message);
      updateNotification(id, { type: 'error', title: parsed.title, message: parsed.message });
    } finally { setIsDeploying(false); }
  };

  const explorerParam = cluster === 'devnet' ? '?cluster=devnet' : '';

  const MODES = [
    { id: 'single' as Mode,      label: 'Single NFT',     icon: ImageIcon, desc: 'Mint one NFT using Metaplex Token Metadata' },
    { id: 'candymachine' as Mode, label: 'Candy Machine',  icon: Package,   desc: 'Deploy a full collection launchpad (Metaplex v3)' },
    { id: 'mintfrom' as Mode,    label: 'Mint from CM',   icon: Zap,       desc: 'Mint from an existing Candy Machine address' },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Solana Minting</h1>
        <p className="text-slate-400 text-sm">Mint NFTs on Solana using Metaplex — single tokens or full Candy Machine collections</p>
      </div>

      <div className="flex items-start gap-3 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs">
        <Info className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 mt-1" />
        <div className="text-purple-300/80 space-y-1">
          <p><strong className="text-purple-300">Solana NFT Workflow:</strong> The generative art + metadata + IPFS steps are identical to Cronos.</p>
          <ol className="list-decimal list-inside space-y-0.5 pl-1 text-purple-300/70">
            <li>Use <strong>NFT Engine</strong> to generate your collection artwork</li>
            <li>Use <strong>Metadata</strong> builder to create JSON attribute files</li>
            <li>Use <strong>IPFS</strong> manager to upload images + metadata → get CIDs</li>
            <li>Return here with the metadata base URI → deploy Candy Machine</li>
          </ol>
        </div>
      </div>

      {}
      <div className="grid grid-cols-3 gap-3">
        {MODES.map(m => (
          <button key={m.id} onClick={() => { setMode(m.id); setResult(null); setError(null); }}
            className={cn('p-3.5 rounded-xl border text-left transition-all', mode === m.id ? 'bg-purple-600/15 border-purple-500/50' : 'bg-slate-900 border-slate-800 hover:border-slate-700')}>
            <m.icon className={cn('w-4 h-4 mb-2', mode === m.id ? 'text-purple-400' : 'text-slate-400')} />
            <p className={cn('text-xs font-bold', mode === m.id ? 'text-white' : 'text-slate-300')}>{m.label}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{m.desc}</p>
          </button>
        ))}
      </div>

      {}
      {mode === 'single' && !result && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
          <h2 className="text-sm font-bold text-white">Single NFT — Metaplex Token Metadata</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="NFT Name *" value={singleConfig.name} onChange={v => setSingleConfig(p => ({ ...p, name: v }))} placeholder="My Solana NFT #1" />
            <Field label="Symbol *" value={singleConfig.symbol} onChange={v => setSingleConfig(p => ({ ...p, symbol: v.toUpperCase() }))} placeholder="MNFT" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Metadata URI * (IPFS JSON)</label>
            <input type="text" value={singleConfig.metadataUri} onChange={e => setSingleConfig(p => ({ ...p, metadataUri: e.target.value }))}
              placeholder="ipfs://Qm… (upload via IPFS Manager first)"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-purple-500/50" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Seller Fee (royalty bps — 500 = 5%)</label>
            <input type="number" value={singleConfig.sellerFeeBasisPoints} min={0} max={10000}
              onChange={e => setSingleConfig(p => ({ ...p, sellerFeeBasisPoints: parseInt(e.target.value) || 0 }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-purple-500/50" />
          </div>
          <ActionButton label="Mint NFT" onAction={handleSingleMint} isLoading={isDeploying} disabled={!solanaWalletAddress} cluster={cluster} />
        </div>
      )}

      {}
      {mode === 'candymachine' && !result && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
          <h2 className="text-sm font-bold text-white">Candy Machine v3 — Collection Launchpad</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Collection Name *" value={cmConfig.collectionName} onChange={v => setCmConfig(p => ({ ...p, collectionName: v }))} placeholder="My Collection" />
            <Field label="Symbol *" value={cmConfig.symbol} onChange={v => setCmConfig(p => ({ ...p, symbol: v.toUpperCase() }))} placeholder="MCOL" />
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Items Available *</label>
              <input type="number" value={cmConfig.itemsAvailable} min={1}
                onChange={e => setCmConfig(p => ({ ...p, itemsAvailable: parseInt(e.target.value) || 0 }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-purple-500/50" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Mint Price (SOL)</label>
              <input type="number" value={cmConfig.price} step={0.01} min={0}
                onChange={e => setCmConfig(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-purple-500/50" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Royalty (bps)</label>
              <input type="number" value={cmConfig.sellerFeeBasisPoints} min={0} max={10000}
                onChange={e => setCmConfig(p => ({ ...p, sellerFeeBasisPoints: parseInt(e.target.value) || 0 }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-purple-500/50" />
            </div>
          </div>
          <ActionButton label="Deploy Candy Machine" onAction={handleDeployCandyMachine} isLoading={isDeploying} disabled={!solanaWalletAddress} cluster={cluster} />
        </div>
      )}

      {}
      {mode === 'mintfrom' && !result && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
          <h2 className="text-sm font-bold text-white">Mint from Existing Candy Machine</h2>
          <Field label="Candy Machine Address *" value={cmAddress} onChange={setCmAddress} placeholder="CandyMachine publickey…" />
          <Field label="Collection Mint Address *" value={collectionMint} onChange={setCollectionMint} placeholder="Collection NFT mint address…" />
          <ActionButton label="Mint NFT" onAction={handleMintFromCM} isLoading={isDeploying} disabled={!solanaWalletAddress} cluster={cluster} />
        </div>
      )}

      {}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{error}
        </div>
      )}

      {}
      {result && (
        <div className="bg-slate-900 rounded-2xl border border-green-500/30 bg-green-500/5 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-400" />
            <p className="font-bold text-white">
              {mode === 'candymachine' ? 'Candy Machine Deployed!' : 'NFT Minted!'}
            </p>
          </div>
          {mode === 'candymachine' && result.candyMachineAddress && (
            <InfoRow label="Candy Machine" value={result.candyMachineAddress} />
          )}
          {result.mintAddress && <InfoRow label="Mint Address" value={result.mintAddress} />}
          <a href={result.explorerUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300">
            <Globe className="w-3.5 h-3.5" /> View on Solscan <ExternalLink className="w-3 h-3" />
          </a>
          <button onClick={() => setResult(null)} className="text-xs text-slate-400 hover:text-slate-300 underline">
            {mode === 'candymachine' ? 'Deploy another' : 'Mint another NFT'}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 mb-1.5">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-purple-500/50" />
    </div>
  );
}

function ActionButton({ label, onAction, isLoading, disabled, cluster }: { label: string; onAction: () => void; isLoading: boolean; disabled: boolean; cluster: string }) {
  return (
    <>
      <button onClick={onAction} disabled={isLoading || disabled}
        className={cn('w-full py-3.5 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2',
          disabled ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : isLoading ? 'bg-purple-700 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/30')}>
        {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> :
         disabled ? 'Connect Phantom Wallet' :
         <><Zap className="w-4 h-4" /> {label} on {cluster === 'devnet' ? 'Devnet' : 'Mainnet'}</>}
      </button>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-950/50 rounded-lg p-3">
      <p className="text-[10px] text-slate-500 uppercase font-bold mb-0.5">{label}</p>
      <p className="text-white font-mono text-xs break-all">{value}</p>
    </div>
  );
}
export default SolanaMinting;
