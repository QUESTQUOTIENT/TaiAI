import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { useAppStore } from '../store';
import {
  Rocket, CheckCircle, ArrowRight, ArrowLeft, Zap, Shield,
  Coins, Database, Code, AlertTriangle, ExternalLink, Copy,
  Sparkles, Star, Gift, Clock, Users, Lock, RefreshCw, Globe,
} from 'lucide-react';
import { isSolanaNetwork } from '../types';
import { Link } from 'react-router-dom';


const TEMPLATES = [
  {
    id: 'standard',
    name: 'Standard NFT Drop',
    icon: '🚀',
    description: 'Public mint with fixed price. Best for most projects.',
    features: ['Fixed price mint', 'ERC721A (gas optimized)', 'Reveal system', 'Pausable'],
    config: {
      type: 'ERC721A' as const, supply: 1000, price: '5', maxPerTx: 5,
      allowlist: false, soulbound: false, burnable: true, royalty: 5,
    },
    badge: 'Most Popular', badgeColor: 'blue',
  },
  {
    id: 'allowlist',
    name: 'Allowlist + Public',
    icon: '📋',
    description: 'Two-phase: whitelist presale then public mint.',
    features: ['Merkle proof allowlist', 'Presale + public phases', 'Per-wallet limits', 'ERC721A'],
    config: {
      type: 'ERC721A' as const, supply: 3000, price: '10', maxPerTx: 3,
      allowlist: true, soulbound: false, burnable: true, royalty: 5,
    },
    badge: 'Recommended', badgeColor: 'green',
  },
  {
    id: 'free',
    name: 'Free Mint',
    icon: '🎁',
    description: 'Free community mint with wallet cap for fairness.',
    features: ['Zero mint cost', 'Max per wallet enforced', 'Anti-bot cooldown', 'Pausable'],
    config: {
      type: 'ERC721A' as const, supply: 500, price: '0', maxPerTx: 1,
      allowlist: false, soulbound: false, burnable: false, royalty: 7.5,
    },
    badge: 'Community', badgeColor: 'purple',
  },
  {
    id: 'soulbound',
    name: 'Soulbound Token',
    icon: '⛓️',
    description: 'Non-transferable membership or achievement token.',
    features: ['Non-transferable', 'Owner-only mint', 'ERC721', 'No marketplace listing'],
    config: {
      type: 'ERC721' as const, supply: 10000, price: '0', maxPerTx: 1,
      allowlist: false, soulbound: true, burnable: false, royalty: 0,
    },
    badge: 'Identity', badgeColor: 'orange',
  },
  {
    id: 'edition',
    name: 'Multi-Edition (1155)',
    icon: '🎨',
    description: 'Multiple NFT types in one contract. Great for gaming.',
    features: ['Multiple token types', 'Batch transfers', 'ERC1155 standard', 'Low gas per token'],
    config: {
      type: 'ERC1155' as const, supply: 10000, price: '3', maxPerTx: 10,
      allowlist: false, soulbound: false, burnable: true, royalty: 5,
    },
    badge: 'Gaming', badgeColor: 'yellow',
  },
  {
    id: 'custom',
    name: 'Custom Configuration',
    icon: '⚙️',
    description: 'Start from scratch with full control over all settings.',
    features: ['Full config control', 'Advanced contract builder', 'Expert mode'],
    config: {
      type: 'ERC721A' as const, supply: 1000, price: '5', maxPerTx: 5,
      allowlist: false, soulbound: false, burnable: true, royalty: 5,
    },
    badge: 'Advanced', badgeColor: 'slate',
  },
];


const STEPS = [
  { id: 'template', label: 'Choose Template', icon: Sparkles },
  { id: 'info',     label: 'Collection Info',  icon: Database },
  { id: 'settings', label: 'Mint Settings',   icon: Coins },
  { id: 'review',   label: 'Review & Compile', icon: Code },
  { id: 'deploy',   label: 'Deploy',           icon: Rocket },
];

interface WizardState {
  templateId: string;
  name: string;
  symbol: string;
  description: string;
  type: 'ERC721' | 'ERC721A' | 'ERC1155';
  supply: number;
  price: string;
  maxPerTx: number;
  allowlist: boolean;
  soulbound: boolean;
  burnable: boolean;
  royalty: number;
  royaltyAddress: string;
  baseURI: string;
  hiddenURI: string;
  useReveal: boolean;
}




function Field({ label, error, note, children }: { label: string; error?: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 mb-1.5">{label}</label>
      {children}
      {note && !error && <p className="text-[10px] text-slate-600 mt-1">{note}</p>}
      {error && <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{error}</p>}
    </div>
  );
}

export function DeployWizard() {
  const _network = useAppStore(s => s.network);
  if (isSolanaNetwork(_network)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4 p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto">
          <Rocket className="w-8 h-8 text-purple-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Deploy Wizard is EVM-only</h2>
        <p className="text-slate-400 max-w-md text-sm">
          The Deploy Wizard compiles and deploys Solidity contracts to Cronos.
          On Solana, use Metaplex Candy Machine to launch your collection.
        </p>
        <Link to="/minting"
          className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl transition-colors">
          <Zap className="w-4 h-4" /> Go to Solana Minting
        </Link>
      </div>
    );
  }
  const navigate = useNavigate();
  const { walletAddress, network, addNotification, updateNotification, setDeployedAddress, deployedAddress, updateAdvancedContractConfig, ipfsCid } = useAppStore();

  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    templateId: 'standard', name: '', symbol: '', description: '',
    type: 'ERC721A', supply: 1000, price: '5', maxPerTx: 5,
    allowlist: false, soulbound: false, burnable: true, royalty: 5,
    royaltyAddress: walletAddress || '',
    baseURI: ipfsCid ? `ipfs://${ipfsCid}/` : '',
    hiddenURI: '', useReveal: false,
  });

  const [isCompiling, setIsCompiling] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [compilationResult, setCompilationResult] = useState<any>(null);
  const [deployedAddr, setDeployedAddr] = useState('');
  const [txHash, setTxHash] = useState('');
  const [gasEstimate, setGasEstimate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  
  useEffect(() => {
    if (walletAddress && !state.royaltyAddress) {
      setState(p => ({ ...p, royaltyAddress: walletAddress }));
    }
  }, [walletAddress]);

  
  useEffect(() => {
    if (ipfsCid && !state.baseURI) {
      setState(p => ({ ...p, baseURI: `ipfs://${ipfsCid}/` }));
    }
  }, [ipfsCid]);

  const update = (key: keyof WizardState, val: any) => {
    setState(p => ({ ...p, [key]: val }));
    if (errors[key]) setErrors(p => { const n = { ...p }; delete n[key]; return n; });
  };

  const selectTemplate = (t: typeof TEMPLATES[0]) => {
    setState(p => ({
      ...p,
      templateId: t.id,
      type: t.config.type,
      supply: t.config.supply,
      price: t.config.price,
      maxPerTx: t.config.maxPerTx,
      allowlist: t.config.allowlist,
      soulbound: t.config.soulbound,
      burnable: t.config.burnable,
      royalty: t.config.royalty,
    }));
    setStep(1);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (step === 1) {
      if (!state.name.trim()) errs.name = 'Required';
      if (!state.symbol.trim()) errs.symbol = 'Required';
      else if (!/^[A-Z0-9]{1,10}$/.test(state.symbol)) errs.symbol = 'Uppercase letters only, max 10 chars';
    }
    if (step === 2) {
      if (state.supply < 1) errs.supply = 'Must be at least 1';
      if (parseFloat(state.price) < 0) errs.price = 'Cannot be negative';
      if (state.maxPerTx < 1) errs.maxPerTx = 'Must be at least 1';
      if (state.royalty < 0 || state.royalty > 20) errs.royalty = '0–20%';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => { if (validate()) setStep(p => p + 1); };
  const handleBack = () => setStep(p => p - 1);

  
  const buildConfig = () => {
    return {
      name: state.name,
      symbol: state.symbol,
      type: state.type,
      supply: {
        type: 'fixed' as const,
        maxSupply: state.supply,
        maxPerWallet: state.maxPerTx * 2,
        maxPerTransaction: state.maxPerTx,
        startTokenId: 1,
        reservedSupply: 0,
      },
      mint: {
        publicMint: { enabled: true, price: state.price, maxPerTx: state.maxPerTx, startTime: '', endTime: '' },
        allowlistMint: { enabled: state.allowlist, price: (parseFloat(state.price) * 0.8).toFixed(4), merkleRoot: '' },
        freeMint: { enabled: false, maxPerWallet: 0 },
        dutchAuction: { enabled: false, startPrice: '0', endPrice: '0', duration: 0, interval: 0 },
        isPaused: false,
      },
      royalty: { percentage: state.royalty, receiver: state.royaltyAddress, isEditable: true },
      advanced: {
        baseURI: state.baseURI,
        isRevealed: !state.useReveal,
        hiddenURI: state.hiddenURI || 'ipfs://QmYDvPAXtiJg7s8JdRBSLWdgSphQdac8j1YuQNNxcGE1hg/hidden.json',
        isBurnable: state.burnable,
        isPausable: true,
        isOwnerMint: true,
        isBatchMint: false,
        isMetadataFrozen: false,
        isUpgradeable: false,
        isSoulbound: state.soulbound,
      },
      gas: { mode: 'auto' as const, gasPrice: '0', gasLimit: '0' },
    };
  };

  const handleCompile = async () => {
    setIsCompiling(true);
    const cfg = buildConfig();
    const notifId = addNotification({ type: 'loading', title: 'Compiling Contract…', message: 'This may take 10–30s', duration: 0 });
    try {
      const res = await fetch('/api/contract/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: cfg }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Compilation failed');
      setCompilationResult(data);
      updateNotification(notifId, { type: 'success', title: 'Compiled!', message: 'ABI and bytecode ready.', duration: 3000 });
      
      try {
        const gasRes = await fetch('/api/contract/estimate-gas', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bytecode: data.bytecode, abi: data.abi, networkId: network.chainId,
            constructorArgs: [state.baseURI || '', state.hiddenURI || ''],
          }),
        });
        const gasData = await gasRes.json();
        setGasEstimate(`${Number(gasData.gasEstimate).toLocaleString()} units (~${gasData.estimatedCostCRO} CRO)`);
      } catch { setGasEstimate('~2,500,000 units'); }
    } catch (err: any) {
      updateNotification(notifId, { type: 'error', title: 'Compilation Failed', message: err.message, duration: 8000 });
    } finally {
      setIsCompiling(false);
    }
  };

  const handleDeploy = async () => {
    if (!compilationResult || !walletAddress || !(window as any).ethereum) return;
    setIsDeploying(true);
    const cfg = buildConfig();
    const notifId = addNotification({ type: 'loading', title: 'Deploying Contract…', message: 'Confirm in wallet', duration: 0 });
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const net = await provider.getNetwork();
      if (Number(net.chainId) !== network.chainId) throw new Error(`Wrong network — switch to ${network.name}`);
      const signer = await provider.getSigner();
      const factory = new ethers.ContractFactory(compilationResult.abi, compilationResult.bytecode, signer);
      const constructorArgs = [state.baseURI || '', state.hiddenURI || ''];
      updateNotification(notifId, { type: 'loading', title: 'Sign Deployment…', message: 'Confirm the transaction in your wallet', duration: 0 });
      const contract = await factory.deploy(...constructorArgs);
      const hash = contract.deploymentTransaction()?.hash || '';
      setTxHash(hash);
      updateNotification(notifId, { type: 'loading', title: 'Mining…', message: `TX: ${hash.slice(0, 12)}…`, duration: 0 });
      const deployed = await contract.waitForDeployment();
      const address = await deployed.getAddress();
      setDeployedAddr(address);
      setDeployedAddress(address);
      
      updateAdvancedContractConfig(cfg);
      updateNotification(notifId, { type: 'success', title: '🎉 Contract Deployed!', message: `${address.slice(0, 10)}…`, duration: 10000 });
      
      await fetch('/api/contract/deployments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: walletAddress, networkId: network.chainId, contractAddress: address, contractType: state.type, name: state.name, symbol: state.symbol, txHash: hash }),
      });
    } catch (err: any) {
      const msg = err.code === 4001 ? 'Transaction rejected.' : (err.message || 'Deploy failed');
      updateNotification(notifId, { type: 'error', title: 'Deploy Failed', message: msg, duration: 8000 });
    } finally {
      setIsDeploying(false);
    }
  };

  const copy = (t: string) => { navigator.clipboard.writeText(t); addNotification({ type: 'success', title: 'Copied', message: '', duration: 2000 }); };

  
  
  

  const inp = "w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white text-sm focus:border-blue-500 outline-none transition-colors";
  const inpErr = (k: string) => errors[k] ? inp + " border-red-500/50" : inp;

  
  const renderStep = () => {
    switch (step) {
      
      case 0: return (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-black text-white">Choose a Template</h2>
            <p className="text-slate-400 text-sm mt-1">Pick a starting point. You can customize every detail in the next steps.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => selectTemplate(t)}
                className={`text-left p-5 rounded-xl border transition-all hover:border-blue-500/50 group ${state.templateId === t.id ? 'border-blue-500/50 bg-blue-600/5' : 'border-slate-800 bg-slate-900 hover:bg-slate-800/50'}`}>
                <div className="flex items-start justify-between mb-3">
                  <span className="text-3xl">{t.icon}</span>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                    t.badgeColor === 'blue'  ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                    t.badgeColor === 'green' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                    t.badgeColor === 'purple'? 'bg-purple-500/20 text-purple-400 border-purple-500/30' :
                    t.badgeColor === 'orange'? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                    t.badgeColor === 'yellow'? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                    'bg-slate-700 text-slate-400 border-slate-600'
                  }`}>{t.badge}</span>
                </div>
                <h3 className="text-white font-bold mb-1">{t.name}</h3>
                <p className="text-slate-400 text-xs mb-3 leading-relaxed">{t.description}</p>
                <ul className="space-y-1">
                  {t.features.map(f => (
                    <li key={f} className="flex items-center gap-1.5 text-xs text-slate-500">
                      <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex items-center gap-1.5 text-xs text-blue-400 font-bold group-hover:gap-2.5 transition-all">
                  Select <ArrowRight className="w-3 h-3" />
                </div>
              </button>
            ))}
          </div>
        </div>
      );

      
      case 1: return (
        <div className="max-w-xl space-y-5">
          <div>
            <h2 className="text-2xl font-black text-white">Collection Info</h2>
            <p className="text-slate-400 text-sm mt-1">These appear on-chain and in marketplaces. Choose carefully — they cannot be changed after deployment.</p>
          </div>
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Collection Name *" error={errors.name} note="e.g. Cronos Apes">
                <input value={state.name} onChange={e => update('name', e.target.value)} placeholder="My NFT Collection" className={inpErr('name')} />
              </Field>
              <Field label="Token Symbol *" error={errors.symbol} note="2–6 uppercase letters">
                <input value={state.symbol} onChange={e => update('symbol', e.target.value.toUpperCase())} placeholder="MNFT" maxLength={10} className={inpErr('symbol')} />
              </Field>
            </div>
            <Field label="Description" note="Shown on marketplaces. Optional.">
              <textarea value={state.description} onChange={e => update('description', e.target.value)} rows={3} placeholder="Describe your collection…" className={inp + " resize-none"} />
            </Field>
            <Field label="Contract Standard" note={
              state.type === 'ERC721A' ? 'Optimized batch minting — saves up to 90% gas. Recommended.' :
              state.type === 'ERC721' ? 'Standard NFT. Best marketplace compatibility.' :
              'Multiple token types in one contract. Best for gaming.'
            }>
              <div className="grid grid-cols-3 gap-2">
                {(['ERC721', 'ERC721A', 'ERC1155'] as const).map(t => (
                  <button key={t} onClick={() => update('type', t)}
                    className={`py-2.5 rounded-lg text-sm font-bold border transition-all ${state.type === t ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'}`}>
                    {t}
                    {t === 'ERC721A' && <span className="ml-1 text-[9px] text-blue-300">✦ GAS</span>}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </div>
      );

      
      case 2: return (
        <div className="max-w-2xl space-y-5">
          <div>
            <h2 className="text-2xl font-black text-white">Mint Settings</h2>
            <p className="text-slate-400 text-sm mt-1">Configure supply, pricing, and mint mechanics.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-4">
              <h3 className="text-white font-bold flex items-center gap-2"><Coins className="w-4 h-4 text-blue-400" /> Supply & Pricing</h3>
              <Field label="Max Supply" error={errors.supply} note="Total NFTs available">
                <input type="number" value={state.supply} onChange={e => update('supply', parseInt(e.target.value) || 0)} min={1} className={inpErr('supply')} />
              </Field>
              <Field label="Mint Price (CRO)" error={errors.price} note="Set to 0 for free mint">
                <div className="relative">
                  <input type="text" value={state.price} onChange={e => update('price', e.target.value)} placeholder="5" className={inpErr('price')} />
                  <span className="absolute right-3 top-2.5 text-slate-500 text-sm font-bold">CRO</span>
                </div>
              </Field>
              <Field label="Max Mint Per Tx" error={errors.maxPerTx} note="Anti-bot protection">
                <input type="number" value={state.maxPerTx} onChange={e => update('maxPerTx', parseInt(e.target.value) || 1)} min={1} max={100} className={inpErr('maxPerTx')} />
              </Field>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
                <h3 className="text-white font-bold flex items-center gap-2"><Shield className="w-4 h-4 text-blue-400" /> Features</h3>
                {[
                  { key: 'allowlist', label: 'Allowlist Phase', desc: 'Merkle-proof presale before public', icon: '📋' },
                  { key: 'useReveal', label: 'Delayed Reveal', desc: 'Hidden metadata until reveal tx', icon: '🎭' },
                  { key: 'burnable',  label: 'Burnable',       desc: 'Holders can burn their NFTs', icon: '🔥' },
                  { key: 'soulbound', label: 'Soulbound',      desc: 'Non-transferable after mint', icon: '⛓️' },
                ].map(({ key, label, desc, icon }) => (
                  <label key={key} className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${(state as any)[key] ? 'bg-blue-600/10 border-blue-500/40' : 'bg-slate-950 border-slate-800'}`}>
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{icon}</span>
                      <div>
                        <p className="text-sm text-white font-medium">{label}</p>
                        <p className="text-[10px] text-slate-500">{desc}</p>
                      </div>
                    </div>
                    <div onClick={() => update(key as keyof WizardState, !(state as any)[key])}
                      className={`w-9 h-5 rounded-full relative transition-colors ${(state as any)[key] ? 'bg-blue-600' : 'bg-slate-700'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${(state as any)[key] ? 'left-[18px]' : 'left-0.5'}`} />
                    </div>
                  </label>
                ))}
              </div>

              <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
                <h3 className="text-white font-bold flex items-center gap-2"><Star className="w-4 h-4 text-yellow-400" /> Royalties (ERC-2981)</h3>
                <Field label="Royalty %" error={errors.royalty} note="0–20%. Paid on secondary sales.">
                  <div className="flex gap-2">
                    {[0, 2.5, 5, 7.5, 10].map(v => (
                      <button key={v} onClick={() => update('royalty', v)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${state.royalty === v ? 'bg-blue-600 text-white' : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'}`}>
                        {v}%
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Royalty Recipient">
                  <input value={state.royaltyAddress} onChange={e => update('royaltyAddress', e.target.value)} placeholder="0x… (defaults to your wallet)" className={inp} />
                </Field>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
            <h3 className="text-white font-bold flex items-center gap-2"><Globe className="w-4 h-4 text-blue-400" /> Metadata URIs</h3>
            <Field label="Base URI" note={ipfsCid ? `Auto-filled from IPFS (CID: ${ipfsCid.slice(0, 12)}…)` : 'The root of your metadata. Upload to IPFS first.'}>
              <input value={state.baseURI} onChange={e => update('baseURI', e.target.value)} placeholder="ipfs://Qm…/ or https://…/" className={inp + " font-mono text-xs"} />
            </Field>
            {state.useReveal && (
              <Field label="Hidden URI (pre-reveal)" note="Shown before reveal. A placeholder image.">
                <input value={state.hiddenURI} onChange={e => update('hiddenURI', e.target.value)} placeholder="ipfs://… (hidden.json)" className={inp + " font-mono text-xs"} />
              </Field>
            )}
          </div>
        </div>
      );

      
      case 3: return (
        <div className="max-w-2xl space-y-5">
          <div>
            <h2 className="text-2xl font-black text-white">Review & Compile</h2>
            <p className="text-slate-400 text-sm mt-1">Verify your settings before deploying. Compilation is required to generate the bytecode.</p>
          </div>

          {}
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
            <h3 className="text-white font-bold mb-4">Contract Summary</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {[
                ['Name', state.name],
                ['Symbol', state.symbol],
                ['Standard', state.type],
                ['Max Supply', state.supply.toLocaleString()],
                ['Mint Price', `${state.price} CRO`],
                ['Max/Tx', String(state.maxPerTx)],
                ['Allowlist', state.allowlist ? '✅ Enabled' : '—'],
                ['Reveal', state.useReveal ? '✅ Delayed' : 'Instant'],
                ['Burnable', state.burnable ? '✅ Yes' : 'No'],
                ['Soulbound', state.soulbound ? '✅ Yes' : 'No'],
                ['Royalty', state.royalty > 0 ? `${state.royalty}%` : 'None'],
                ['Network', network.name],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1 border-b border-slate-800/50">
                  <span className="text-slate-500">{k}</span>
                  <span className="text-white font-medium">{v}</span>
                </div>
              ))}
            </div>
            {state.baseURI && (
              <div className="mt-3 pt-3 border-t border-slate-800">
                <p className="text-xs text-slate-500 mb-1">Base URI</p>
                <p className="text-xs text-white font-mono break-all">{state.baseURI}</p>
              </div>
            )}
          </div>

          {}
          {!compilationResult ? (
            <button onClick={handleCompile} disabled={isCompiling}
              className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl font-black text-lg flex items-center justify-center gap-3 transition-colors">
              {isCompiling ? <><RefreshCw className="w-5 h-5 animate-spin" /> Compiling… (10–30s)</> : <><Zap className="w-5 h-5" /> Compile Contract</>}
            </button>
          ) : (
            <div className="bg-green-500/10 border border-green-500/30 p-5 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <p className="text-green-400 font-bold">Compilation Successful</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-slate-950 p-3 rounded-lg">
                  <p className="text-slate-500 text-xs">ABI Functions</p>
                  <p className="text-white font-bold text-lg">{compilationResult.abi?.filter((i: any) => i.type === 'function').length}</p>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg">
                  <p className="text-slate-500 text-xs">Bytecode</p>
                  <p className="text-white font-bold text-lg">{Math.round(compilationResult.bytecode?.length / 2 / 1024)}KB</p>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg">
                  <p className="text-slate-500 text-xs">Est. Gas</p>
                  <p className="text-white font-bold text-sm">{gasEstimate || '~2.5M'}</p>
                </div>
              </div>
              <button onClick={handleNext}
                className="mt-4 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                Proceed to Deploy <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      );

      
      case 4: return (
        <div className="max-w-xl space-y-5">
          <div>
            <h2 className="text-2xl font-black text-white">Deploy to {network.name}</h2>
            <p className="text-slate-400 text-sm mt-1">One click to deploy your contract. Make sure your wallet is connected and on the right network.</p>
          </div>

          {!deployedAddr ? (
            <>
              <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm">Network</span>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${network.isTestnet ? 'bg-yellow-400' : 'bg-green-400'}`} />
                    <span className="text-white font-semibold text-sm">{network.name}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm">Wallet</span>
                  <span className="text-white font-mono text-xs">{walletAddress ? `${walletAddress.slice(0, 8)}…${walletAddress.slice(-4)}` : '⚠️ Not connected'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm">Estimated Gas</span>
                  <span className="text-white text-sm">{gasEstimate || '~2,500,000 units'}</span>
                </div>
              </div>

              {!walletAddress && (
                <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-400">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" /> Connect your wallet first
                </div>
              )}

              <button onClick={handleDeploy} disabled={isDeploying || !walletAddress || !compilationResult}
                className="w-full py-5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 text-white rounded-xl font-black text-xl flex items-center justify-center gap-3 shadow-lg shadow-blue-900/30 transition-all active:scale-95">
                {isDeploying
                  ? <><RefreshCw className="w-6 h-6 animate-spin" /> Deploying…</>
                  : <><Rocket className="w-6 h-6" /> Deploy {state.name || 'Contract'}</>
                }
              </button>
            </>
          ) : (
            <div className="bg-green-500/8 border border-green-500/30 p-6 rounded-xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <p className="text-xl font-black text-white">🎉 Deployed!</p>
                  <p className="text-green-400 text-sm">{state.name} is live on {network.name}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-slate-400 text-xs">Contract</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono text-xs">{deployedAddr.slice(0, 12)}…{deployedAddr.slice(-6)}</span>
                    <button onClick={() => copy(deployedAddr)}><Copy className="w-3 h-3 text-slate-400 hover:text-white" /></button>
                    <a href={`${network.explorerUrl}/address/${deployedAddr}`} target="_blank" rel="noreferrer"><ExternalLink className="w-3 h-3 text-blue-400" /></a>
                  </div>
                </div>
                {txHash && (
                  <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-xs">TX Hash</span>
                    <a href={`${network.explorerUrl}/tx/${txHash}`} target="_blank" rel="noreferrer"
                      className="text-blue-400 hover:text-blue-300 font-mono text-xs flex items-center gap-1">
                      {txHash.slice(0, 12)}… <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => navigate('/minting')}
                  className="py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
                  <Zap className="w-4 h-4" /> Open Minting
                </button>
                <button onClick={() => navigate('/analytics')}
                  className="py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm transition-colors">
                  View Analytics
                </button>
              </div>
              <button onClick={() => navigate('/marketplace')}
                className="w-full py-2.5 border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white rounded-xl text-sm font-medium transition-colors">
                Prepare for Marketplace →
              </button>
            </div>
          )}
        </div>
      );

      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      {}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            <span className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Rocket className="w-5 h-5 text-white" />
            </span>
            Deploy Wizard
          </h1>
          <p className="text-slate-400 text-sm mt-1 ml-13">Deploy your NFT contract in minutes — no coding required.</p>
        </div>
      </div>

      {}
      <div className="flex items-center gap-2 bg-slate-900/50 p-4 rounded-xl border border-slate-800 overflow-x-auto">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.id}>
            <div className={`flex items-center gap-2 flex-shrink-0 text-sm font-medium cursor-pointer ${i <= step ? 'text-white' : 'text-slate-600'}`}
              onClick={() => { if (i < step) setStep(i); }}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                i < step  ? 'bg-green-600 text-white' :
                i === step ? 'bg-blue-600 text-white ring-2 ring-blue-400/30' :
                'bg-slate-800 text-slate-600'
              }`}>
                {i < step ? <CheckCircle className="w-3.5 h-3.5" /> : <s.icon className="w-3.5 h-3.5" />}
              </div>
              <span className="hidden sm:inline whitespace-nowrap">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px min-w-4 transition-colors ${i < step ? 'bg-green-600/40' : 'bg-slate-800'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {}
      <div className="min-h-96">
        {renderStep()}
      </div>

      {}
      {step > 0 && step < 4 && !deployedAddr && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <button onClick={handleBack}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          {step < 3 && (
            <button onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors">
              Next <ArrowRight className="w-4 h-4" />
            </button>
          )}
          {step === 3 && !compilationResult && (
            <p className="text-xs text-slate-500">Compile first to proceed →</p>
          )}
        </div>
      )}
    </div>
  );
}
export default DeployWizard;
