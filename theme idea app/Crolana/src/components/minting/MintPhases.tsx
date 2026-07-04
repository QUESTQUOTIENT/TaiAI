import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../../store';
import { MintPhase } from '../../types';
import {
  Plus, Trash2, Edit2, Check, X, Upload, Copy, PauseCircle, PlayCircle,
  Zap, AlertTriangle, CheckCircle, Clock, Users, Coins, Shield, Loader2,
  RefreshCw, ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import Papa from 'papaparse';
import { ethers } from 'ethers';
import { getReadProvider } from '../../lib/provider';

const PHASE_ABI = [
  'function setCost(uint256 _newCost) external',
  'function setMaxMintAmountPerTx(uint256 _newMax) external',
  'function setMerkleRoot(bytes32 _merkleRoot) external',
  'function setPaused(bool _state) external',
  'function cost() view returns (uint256)',
  'function maxMintAmountPerTx() view returns (uint256)',
  'function paused() view returns (bool)',
];

interface OnChainState {
  cost: bigint;
  maxPerTx: number;
  paused: boolean;
}

export function MintPhases() {
  const {
    mintPhases, addMintPhase, updateMintPhase, removeMintPhase,
    deployedAddress, addNotification, updateNotification, network,
  } = useAppStore();

  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [onChain, setOnChain] = useState<OnChainState | null>(null);
  const [isLoadingChain, setIsLoadingChain] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [newPhase, setNewPhase] = useState<Partial<MintPhase>>({
    type: 'public',
    price: '0',
    maxPerWallet: 5,
    maxPerTransaction: 5,
    isActive: false,
  });

  const loadOnChainState = useCallback(async () => {
    if (!deployedAddress || !(window as any).ethereum) return;
    setIsLoadingChain(true);
    try {
      const provider = getReadProvider(network.chainId);
      const contract = new ethers.Contract(deployedAddress, PHASE_ABI, provider);
      const [cost, maxPerTx, paused] = await Promise.all([
        contract.cost(),
        contract.maxMintAmountPerTx(),
        contract.paused(),
      ]);
      setOnChain({ cost, maxPerTx: Number(maxPerTx), paused });
    } catch {}
    finally { setIsLoadingChain(false); }
  }, [deployedAddress]);

  useEffect(() => { loadOnChainState(); }, [loadOnChainState]);

  const handleCreate = () => {
    if (!newPhase.name?.trim()) {
      addNotification({ type: 'error', title: 'Name required', message: 'Give the phase a name.', duration: 3000 });
      return;
    }
    addMintPhase({
      id: crypto.randomUUID(),
      name: newPhase.name!,
      type: newPhase.type as 'public' | 'allowlist',
      price: newPhase.price || '0',
      maxPerWallet: newPhase.maxPerWallet || 5,
      maxPerTransaction: newPhase.maxPerTransaction || 5,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 86400000).toISOString(),
      merkleRoot: newPhase.merkleRoot,
      allowlist: newPhase.allowlist,
      isActive: false,
    });
    setIsCreating(false);
    setNewPhase({ type: 'public', price: '0', maxPerWallet: 5, maxPerTransaction: 5, isActive: false });
    addNotification({ type: 'success', title: 'Phase Created', message: `"${newPhase.name}" added. Apply it to push settings on-chain.`, duration: 4000 });
  };

  const handleApplyPhase = async (phase: MintPhase) => {
    if (!deployedAddress || !(window as any).ethereum) {
      addNotification({ type: 'error', title: 'Not Ready', message: 'Connect wallet and deploy a contract first.', duration: 4000 });
      return;
    }
    setApplying(phase.id);
    const notifId = addNotification({ type: 'loading', title: `Applying: ${phase.name}`, message: 'Step 1 — Setting price…', duration: 0 });
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const net = await provider.getNetwork();
      if (Number(net.chainId) !== network.chainId)
        throw new Error(`Wrong network — switch to ${network.name}`);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(deployedAddress, PHASE_ABI, signer);

      const costTx = await contract.setCost(ethers.parseEther(phase.price || '0'));
      updateNotification(notifId, { type: 'loading', title: `Applying: ${phase.name}`, message: `Step 1 — TX: ${costTx.hash.slice(0, 10)}…`, duration: 0 });
      await costTx.wait();

      updateNotification(notifId, { type: 'loading', title: `Applying: ${phase.name}`, message: 'Step 2 — Setting max per tx…', duration: 0 });
      const maxTx = await contract.setMaxMintAmountPerTx(phase.maxPerTransaction);
      await maxTx.wait();

      if (phase.type === 'allowlist' && phase.merkleRoot) {
        updateNotification(notifId, { type: 'loading', title: `Applying: ${phase.name}`, message: 'Step 3 — Setting Merkle root…', duration: 0 });
        const rootTx = await contract.setMerkleRoot(phase.merkleRoot);
        await rootTx.wait();
      }

      mintPhases.forEach((p) => updateMintPhase(p.id, { isActive: p.id === phase.id }));
      updateNotification(notifId, {
        type: 'success',
        title: `Phase "${phase.name}" is now Live!`,
        message: `${phase.price} CRO · Max ${phase.maxPerTransaction}/tx${phase.type === 'allowlist' ? ' · Allowlist active' : ''}`,
        duration: 8000,
      });
      await loadOnChainState();
    } catch (err: any) {
      const rejected = err.code === 4001 || err.code === 'ACTION_REJECTED';
      updateNotification(notifId, {
        type: rejected ? 'info' : 'error',
        title: rejected ? 'Cancelled' : 'Apply Failed',
        message: rejected ? 'Rejected in wallet.' : (err.reason || err.shortMessage || err.message || 'Failed'),
        duration: 6000,
      });
    } finally { setApplying(null); }
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>, phaseId?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      complete: async (results) => {
        const addresses = (results.data as string[][])
          .flat()
          .map((v) => (typeof v === 'string' ? v.trim() : ''))
          .filter((v) => ethers.isAddress(v));
        if (addresses.length === 0) {
          addNotification({ type: 'error', title: 'No Valid Addresses', message: 'CSV must contain valid wallet addresses.', duration: 4000 });
          return;
        }
        const notifId = addNotification({ type: 'loading', title: 'Building Merkle Tree…', message: `${addresses.length} addresses`, duration: 0 });
        try {
          const res = await fetch('/api/mint/merkle/generate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addresses }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Merkle generation failed');
          if (phaseId) {
            updateMintPhase(phaseId, { allowlist: addresses, merkleRoot: data.root });
          } else {
            setNewPhase((p) => ({ ...p, allowlist: addresses, merkleRoot: data.root }));
          }
          updateNotification(notifId, { type: 'success', title: 'Merkle Tree Built', message: `Root: ${data.root.slice(0, 14)}… — ${addresses.length} addresses`, duration: 5000 });
        } catch (err: any) {
          updateNotification(notifId, { type: 'error', title: 'Merkle Failed', message: err.message, duration: 5000 });
        }
      },
      skipEmptyLines: true,
    });
  };

  const isPhaseActiveOnChain = (phase: MintPhase): boolean => {
    if (!onChain) return phase.isActive;
    const priceCRO = parseFloat(phase.price || '0');
    const onChainCRO = parseFloat(ethers.formatEther(onChain.cost));
    return Math.abs(priceCRO - onChainCRO) < 0.0001 && onChain.maxPerTx === phase.maxPerTransaction && !onChain.paused;
  };

  const PhaseForm = ({ values, onChange, onSubmit, onCancel, submitLabel, phaseId }: {
    values: Partial<MintPhase>; onChange: (u: Partial<MintPhase>) => void;
    onSubmit: () => void; onCancel: () => void; submitLabel: string; phaseId?: string;
  }) => (
    <div className="bg-slate-950 rounded-xl border border-blue-500/20 p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Phase Name *</label>
          <input type="text" placeholder="e.g. Whitelist Round 1" value={values.name || ''}
            onChange={(e) => onChange({ name: e.target.value })}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Type</label>
          <select value={values.type || 'public'} onChange={(e) => onChange({ type: e.target.value as any })}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none">
            <option value="public">🌐 Public Mint</option>
            <option value="allowlist">🔒 Allowlist / Whitelist</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Price (CRO)</label>
          <input type="number" step="0.001" min="0" placeholder="0" value={values.price || ''}
            onChange={(e) => onChange({ price: e.target.value })}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Max Per Transaction</label>
          <input type="number" min="1" max="100" placeholder="5" value={values.maxPerTransaction || ''}
            onChange={(e) => onChange({ maxPerTransaction: parseInt(e.target.value) || 5 })}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Max Per Wallet</label>
          <input type="number" min="0" max="1000" placeholder="5" value={values.maxPerWallet || ''}
            onChange={(e) => onChange({ maxPerWallet: parseInt(e.target.value) || 5 })}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" />
        </div>
        {values.type === 'allowlist' && (
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Allowlist CSV
              {values.merkleRoot && <span className="ml-2 text-green-400">✓ {values.allowlist?.length} addresses</span>}
            </label>
            <label className="flex items-center gap-2 px-3 py-2 bg-slate-900 border border-slate-800 hover:border-blue-500 rounded-lg cursor-pointer transition-colors text-xs text-slate-400">
              <Upload className="w-3.5 h-3.5" /> Upload CSV (one address per line)
              <input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => handleCSVUpload(e, phaseId)} />
            </label>
            {values.merkleRoot && <p className="text-[10px] text-slate-500 mt-1 font-mono truncate">Root: {values.merkleRoot}</p>}
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
        <button onClick={onCancel} className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors">Cancel</button>
        <button onClick={onSubmit} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2">
          <Check className="w-4 h-4" /> {submitLabel}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Mint Phases</h3>
          <p className="text-xs text-slate-500 mt-0.5">Configure and apply minting rules on-chain</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadOnChainState} disabled={isLoadingChain}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white">
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingChain ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm flex items-center gap-2 transition-colors">
            <Plus className="w-4 h-4" /> New Phase
          </button>
        </div>
      </div>

      {onChain && (
        <div className="flex items-center gap-4 p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs flex-wrap">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-semibold text-white">On-chain now:</span>
          </div>
          <span className="text-slate-300">{ethers.formatEther(onChain.cost)} CRO</span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-300">Max {onChain.maxPerTx}/tx</span>
          <span className="text-slate-500">·</span>
          <span className={onChain.paused ? 'text-red-400' : 'text-green-400'}>{onChain.paused ? '⏸ Paused' : '▶ Active'}</span>
        </div>
      )}

      {isCreating && (
        <PhaseForm values={newPhase} onChange={(u) => setNewPhase((p) => ({ ...p, ...u }))}
          onSubmit={handleCreate} onCancel={() => setIsCreating(false)} submitLabel="Create Phase" />
      )}

      <div className="space-y-3">
        {mintPhases.length === 0 && !isCreating && (
          <div className="p-10 text-center bg-slate-900 rounded-xl border border-dashed border-slate-800">
            <Zap className="w-8 h-8 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-semibold">No mint phases yet</p>
            <p className="text-slate-600 text-xs mt-1">Create phases to control price, limits, and allowlist access</p>
            <button onClick={() => setIsCreating(true)} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-colors">
              Create First Phase
            </button>
          </div>
        )}

        {mintPhases.map((phase) => {
          const active = isPhaseActiveOnChain(phase);
          const isApplying = applying === phase.id;
          const isEditing = editingId === phase.id;
          const isExpanded = expandedId === phase.id;
          return (
            <div key={phase.id} className={`rounded-xl border transition-all ${active ? 'border-green-500/30 bg-green-500/3' : 'border-slate-800 bg-slate-900'}`}>
              <div className="flex items-center gap-4 p-4">
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${active ? 'bg-green-400' : 'bg-slate-600'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-bold text-sm">{phase.name}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${phase.type === 'public' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>{phase.type}</span>
                    {phase.merkleRoot && <span className="text-[10px] bg-orange-500/15 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded font-bold">MERKLE</span>}
                    {active && <span className="text-[10px] bg-green-500/20 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded font-bold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> LIVE</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Coins className="w-3 h-3" />{phase.price || '0'} CRO</span>
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" />Max {phase.maxPerTransaction}/tx</span>
                    {phase.allowlist && <span className="text-orange-400">{phase.allowlist.length} whitelisted</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => handleApplyPhase(phase)} disabled={isApplying || applying !== null}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${active ? 'bg-green-600/20 text-green-400 border border-green-500/30' : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40'}`}>
                    {isApplying ? <Loader2 className="w-3 h-3 animate-spin" /> : active ? <CheckCircle className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                    {isApplying ? 'Applying…' : active ? 'Active' : 'Apply'}
                  </button>
                  <button onClick={() => setExpandedId(isExpanded ? null : phase.id)}
                    className="p-1.5 text-slate-500 hover:text-white bg-slate-800 rounded-lg transition-colors">
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => { setEditingId(phase.id); setExpandedId(phase.id); }}
                    className="p-1.5 text-slate-500 hover:text-white bg-slate-800 rounded-lg transition-colors">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => removeMintPhase(phase.id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 bg-slate-800 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-slate-800 pt-4">
                  {isEditing ? (
                    <PhaseForm values={phase} onChange={(u) => updateMintPhase(phase.id, u)}
                      onSubmit={() => { setEditingId(null); addNotification({ type: 'success', title: 'Phase Updated', message: 'Re-apply to push changes on-chain.', duration: 3000 }); }}
                      onCancel={() => setEditingId(null)} submitLabel="Save Changes" phaseId={phase.id} />
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      {[
                        { label: 'Price', value: `${phase.price || '0'} CRO` },
                        { label: 'Max/tx', value: String(phase.maxPerTransaction) },
                        { label: 'Max/wallet', value: String(phase.maxPerWallet) },
                        { label: 'Type', value: phase.type === 'public' ? 'Public' : 'Allowlist' },
                        { label: 'Start', value: new Date(phase.startTime).toLocaleDateString() },
                        { label: 'End', value: new Date(phase.endTime).toLocaleDateString() },
                        { label: 'Allowlist', value: phase.allowlist ? `${phase.allowlist.length} addrs` : 'None' },
                        { label: 'Merkle Root', value: phase.merkleRoot ? `${phase.merkleRoot.slice(0, 10)}…` : 'None' },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <p className="text-slate-500 mb-0.5">{label}</p>
                          <p className="text-white font-semibold">{value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-4 bg-blue-500/5 border border-blue-500/15 rounded-xl text-xs text-slate-400 space-y-1">
        <p><span className="text-white font-semibold">How phases work:</span> Each phase defines price, per-tx limits, and optional allowlist. Clicking Apply sends 2-3 on-chain transactions.</p>
        <p><span className="text-white font-semibold">Allowlist:</span> Upload a CSV of wallet addresses. The server builds a Merkle tree and sets the root on-chain for allowlist verification.</p>
        <p><span className="text-white font-semibold">Live detection:</span> The green LIVE badge means this phase's settings match on-chain state.</p>
      </div>
    </div>
  );
}
