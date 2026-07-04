import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../../store';
import {
  ChevronDown, ChevronUp, Settings, Shield, Zap, Percent,
  Sliders, CheckCircle, Loader2, Code, Rocket, Copy, ExternalLink, AlertTriangle,
  Globe, Twitter, MessageCircle, Github,
} from 'lucide-react';
import { ethers } from 'ethers';
import { isSolanaNetwork } from '../../types';





type SectionId = 'basic' | 'social' | 'ownership' | 'trading' | 'tax' | 'advanced' | 'modern';

interface SectionProps {
  id: SectionId;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  expanded: Set<SectionId>;
  onToggle: (id: SectionId) => void;
}

function FormSection({ id, icon: Icon, title, children, expanded, onToggle }: SectionProps) {
  const isOpen = expanded.has(id);
  return (
    <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-900/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-4 h-4 text-blue-400" />
          <span className="font-semibold text-white text-sm">{title}</span>
        </div>
        {isOpen
          ? <ChevronUp className="w-4 h-4 text-slate-400" />
          : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {isOpen && (
        <div className="px-4 pb-4 space-y-3">{children}</div>
      )}
    </div>
  );
}

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

function FormInput({ label, ...props }: FormInputProps) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input
        {...props}
        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm
                   text-white focus:border-blue-500 outline-none transition-colors"
      />
    </div>
  );
}

interface ToggleProps {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: () => void;
}

function Toggle({ label, desc, checked, onChange }: ToggleProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-slate-800">
      <div>
        <p className="text-sm text-white font-medium">{label}</p>
        {desc && <p className="text-xs text-slate-500">{desc}</p>}
      </div>
      <button
        type="button"
        onClick={onChange}
        className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${
          checked ? 'bg-blue-600' : 'bg-slate-700'
        }`}
      >
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
          checked ? 'left-[18px]' : 'left-0.5'
        }`} />
      </button>
    </div>
  );
}



export function TokenBuilder() {
  const { addNotification, updateNotification, network, walletAddress } = useAppStore();
  const isSolana = isSolanaNetwork(network);
  
  const [expandedSections, setExpandedSections] = useState<Set<SectionId>>(
    new Set(['basic', 'social', 'ownership', 'trading', 'tax', 'advanced', 'modern'] as SectionId[])
  );
  const [isGenerating, setIsGenerating]       = useState(false);
  const [isCompiling,  setIsCompiling]        = useState(false);
  const [isDeploying,  setIsDeploying]        = useState(false);
  const [generatedSource, setGeneratedSource] = useState<string | null>(null);
  const [contractName,    setContractName]    = useState<string | null>(null);
  const [compiledData,    setCompiledData]    = useState<{ abi: any[]; bytecode: string } | null>(null);
  const [deployedAddress, setDeployedAddress] = useState<string | null>(null);
  const [deployTxHash,    setDeployTxHash]    = useState('');

  const [form, setForm] = useState({
    name:                 '',
    symbol:               '',
    decimals:             18,
    totalSupply:          '',
    fixedSupply:          true,
    ownable:              true,
    renounceAfterDeploy:  false,
    enableTradingOnDeploy: true,
    maxWalletPercent:     100,
    maxTxPercent:         100,
    blacklistFeature:     false,
    buyTax:               0,
    sellTax:              0,
    taxWallet:            '',
    burnTax:              0,
    burnable:             false,
    pausable:             false,
    permit:               false,
    
    isGovernance:         false,   
    hasPermit:            false,   
    hasFlashMint:         false,   
    hasBlacklist:         false,   
    useRoles:             false,   
    logoURI:              '',      
    
    website:              '',
    twitter:              '',
    telegram:             '',
    github:               '',
    description:          '',
  });

  const update = (key: string, val: any) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const toggleSection = (id: SectionId) =>
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const step = !generatedSource ? 0 : !compiledData ? 1 : !deployedAddress ? 2 : 3;
  const stepLabels = ['Configure', 'Generate', 'Compile', 'Deploy'];

  
  const handleGenerate = async () => {
    if (!form.name.trim()) {
      addNotification({ type: 'error', title: 'Missing Name', message: 'Token name is required.', duration: 3000 });
      return;
    }
    if (!form.symbol.trim() || form.symbol.length < 2 || form.symbol.length > 8) {
      addNotification({ type: 'error', title: 'Invalid Symbol', message: '2–8 characters required.', duration: 3000 });
      return;
    }
    if (!form.totalSupply || Number(form.totalSupply) <= 0) {
      addNotification({ type: 'error', title: 'Missing Supply', message: 'Total supply must be > 0.', duration: 3000 });
      return;
    }
    if (form.buyTax + form.sellTax > 25) {
      addNotification({ type: 'error', title: 'Tax Too High', message: 'Buy + sell tax cannot exceed 25%.', duration: 3000 });
      return;
    }
    setIsGenerating(true);
    setCompiledData(null);
    setDeployedAddress(null);
    try {
      const res = await fetch('/api/token/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          
          burnable:  form.burnable,
          pausable:  form.pausable,
          hasPermit: form.hasPermit || form.permit,
          isGovernance: form.isGovernance,
          hasFlashMint: form.hasFlashMint,
          hasBlacklist: form.hasBlacklist,
          useRoles:     form.useRoles,
          logoURI:      form.logoURI,
          
          website:     form.website,
          twitter:     form.twitter,
          telegram:    form.telegram,
          github:      form.github,
          description: form.description,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setGeneratedSource(data.source);
      setContractName(data.contractName);
      addNotification({ type: 'success', title: 'Contract Generated', message: 'Review source code, then compile.', duration: 3000 });
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Generation Failed', message: err.message, duration: 5000 });
    } finally {
      setIsGenerating(false);
    }
  };

  
  
  const extractNameFromSource = (src: string): string => {
    const m = src.match(/\bcontract\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
    return m?.[1] ?? 'Contract';
  };

  const handleCompile = async () => {
    if (!generatedSource) return;
    
    const resolvedName = (contractName && contractName.trim())
      ? contractName.trim()
      : extractNameFromSource(generatedSource);
    setIsCompiling(true);
    const notifId = addNotification({ type: 'loading', title: 'Compiling with solc', message: 'May take 15–30 seconds…', duration: 0 });
    try {
      const res = await fetch('/api/token/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: generatedSource, contractName: resolvedName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Compilation failed');
      
      if (!contractName) setContractName(resolvedName);
      setCompiledData({ abi: data.abi, bytecode: data.bytecode });
      updateNotification(notifId, { type: 'success', title: 'Compiled Successfully', message: 'ABI and bytecode ready to deploy.', duration: 3000 });
    } catch (err: any) {
      updateNotification(notifId, { type: 'error', title: 'Compile Failed', message: err.message, duration: 8000 });
    } finally {
      setIsCompiling(false);
    }
  };

  
  const handleDeploy = async () => {
    if (!compiledData || !(window as any).ethereum || !walletAddress) return;
    setIsDeploying(true);
    const notifId = addNotification({ type: 'loading', title: 'Deploying Token', message: 'Waiting for wallet…', duration: 0 });
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      const currentChain = await provider.getNetwork();
      if (Number(currentChain.chainId) !== network.chainId) {
        await (window as any).ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${network.chainId.toString(16)}` }],
        });
      }

      const factory = new ethers.ContractFactory(compiledData.abi, compiledData.bytecode, signer);
      const contract = await factory.deploy();
      const hash = contract.deploymentTransaction()?.hash || '';
      setDeployTxHash(hash);
      updateNotification(notifId, { type: 'loading', title: 'Mining…', message: `TX: ${hash.slice(0, 12)}…`, duration: 0 });

      const deployed = await contract.waitForDeployment();
      const addr = await deployed.getAddress();
      setDeployedAddress(addr);
      updateNotification(notifId, { type: 'success', title: 'Token Deployed!', message: `${form.symbol} at ${addr.slice(0, 10)}…`, duration: 8000 });

      if (form.renounceAfterDeploy) {
        const nId2 = addNotification({ type: 'loading', title: 'Renouncing Ownership…', message: 'Sending renounce transaction…', duration: 0 });
        const tokenContract = new ethers.Contract(addr, compiledData.abi, signer);
        const renounceTx = await tokenContract.renounceOwnership();
        await renounceTx.wait();
        updateNotification(nId2, { type: 'success', title: 'Ownership Renounced', message: 'Contract is now fully decentralized.', duration: 5000 });
      }

      await fetch('/api/token/save-deployment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: addr, name: form.name, symbol: form.symbol,
          txHash: hash, networkId: network.chainId, userId: walletAddress,
        }),
      });
    } catch (err: any) {
      const msg = err.code === 4001 ? 'Rejected by user.' : (err.message || 'Deploy failed');
      updateNotification(notifId, { type: 'error', title: 'Deploy Failed', message: msg, duration: 6000 });
    } finally {
      setIsDeploying(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    addNotification({ type: 'success', title: 'Copied!', message: '', duration: 2000 });
  };

  if (isSolana) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4 p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto">
          <Zap className="w-8 h-8 text-purple-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Solana Token Builder</h2>
        <p className="text-slate-400 max-w-md text-sm">
          On Solana, tokens are created using the SPL Token program. Use the Minting page to mint SPL tokens and manage your Solana token collection. ERC-20 contracts are only available on Cronos (EVM) networks.
        </p>
        <div className="flex gap-3">
          <Link to="/minting"
            className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl transition-colors">
            <Zap className="w-4 h-4" /> Go to Solana Minting
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-white">ERC-20 Token Builder</h2>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700
                       disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
          >
            {isGenerating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              : <><Code className="w-4 h-4" /> Generate Contract</>}
          </button>
        </div>

        {}
        <FormSection id="basic" icon={Settings} title="Token Basics" expanded={expandedSections} onToggle={toggleSection}>
          <FormInput
            label="Token Name *"
            placeholder="My Token"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormInput
              label="Symbol *"
              placeholder="MTK"
              value={form.symbol}
              onChange={(e) => update('symbol', e.target.value.toUpperCase())}
              maxLength={8}
            />
            <FormInput
              label="Decimals"
              type="number"
              min={0}
              max={18}
              value={form.decimals}
              onChange={(e) => update('decimals', Number(e.target.value))}
            />
          </div>
          <FormInput
            label="Total Supply *"
            placeholder="1,000,000,000"
            type="number"
            value={form.totalSupply}
            onChange={(e) => update('totalSupply', e.target.value)}
          />
          <Toggle
            label="Fixed Supply"
            desc="No minting after deployment"
            checked={form.fixedSupply}
            onChange={() => update('fixedSupply', !form.fixedSupply)}
          />
        </FormSection>

        {}
        <FormSection id="social" icon={Globe} title="Social & Project Links" expanded={expandedSections} onToggle={toggleSection}>
          <p className="text-xs text-slate-500 mb-2 leading-relaxed">
            Optional metadata stored in the contract — wallets, explorers, and token lists can display these.
          </p>
          <FormInput
            label="Project Description"
            placeholder="A DeFi token on Cronos…"
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
          />
          <div className="grid grid-cols-1 gap-2">
            <div className="relative">
              <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1"><Globe className="w-3 h-3" /> Website</label>
              <input
                type="url"
                placeholder="https://myproject.io"
                value={form.website}
                onChange={(e) => update('website', e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition-colors"
              />
            </div>
            <div className="relative">
              <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1"><Twitter className="w-3 h-3" /> Twitter / X</label>
              <input
                type="url"
                placeholder="https://twitter.com/myproject"
                value={form.twitter}
                onChange={(e) => update('twitter', e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition-colors"
              />
            </div>
            <div className="relative">
              <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1"><MessageCircle className="w-3 h-3" /> Telegram</label>
              <input
                type="url"
                placeholder="https://t.me/myproject"
                value={form.telegram}
                onChange={(e) => update('telegram', e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition-colors"
              />
            </div>
            <div className="relative">
              <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1"><Github className="w-3 h-3" /> GitHub</label>
              <input
                type="url"
                placeholder="https://github.com/myproject"
                value={form.github}
                onChange={(e) => update('github', e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition-colors"
              />
            </div>
          </div>
        </FormSection>

        {}
        <FormSection id="ownership" icon={Shield} title="Ownership" expanded={expandedSections} onToggle={toggleSection}>
          <Toggle
            label="Ownable"
            desc="Owner-restricted admin functions"
            checked={form.ownable}
            onChange={() => update('ownable', !form.ownable)}
          />
          {form.ownable && (
            <Toggle
              label="Renounce Ownership After Deploy"
              desc="Fully decentralized — irreversible"
              checked={form.renounceAfterDeploy}
              onChange={() => update('renounceAfterDeploy', !form.renounceAfterDeploy)}
            />
          )}
        </FormSection>

        {}
        <FormSection id="trading" icon={Zap} title="Trading Controls" expanded={expandedSections} onToggle={toggleSection}>
          <Toggle
            label="Enable Trading on Deploy"
            desc="If off, only owner can transfer"
            checked={form.enableTradingOnDeploy}
            onChange={() => update('enableTradingOnDeploy', !form.enableTradingOnDeploy)}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormInput
              label="Max Wallet %"
              type="number"
              min={1}
              max={100}
              value={form.maxWalletPercent}
              onChange={(e) => update('maxWalletPercent', Number(e.target.value))}
            />
            <FormInput
              label="Max TX %"
              type="number"
              min={1}
              max={100}
              value={form.maxTxPercent}
              onChange={(e) => update('maxTxPercent', Number(e.target.value))}
            />
          </div>
          <Toggle
            label="Blacklist Feature"
            desc="Owner can block specific addresses"
            checked={form.blacklistFeature}
            onChange={() => update('blacklistFeature', !form.blacklistFeature)}
          />
        </FormSection>

        {}
        <FormSection id="tax" icon={Percent} title="Tax Configuration" expanded={expandedSections} onToggle={toggleSection}>
          <div className="grid grid-cols-2 gap-3">
            <FormInput
              label="Buy Tax %"
              type="number"
              min={0}
              max={15}
              value={form.buyTax}
              onChange={(e) => update('buyTax', Math.min(15, Number(e.target.value)))}
            />
            <FormInput
              label="Sell Tax %"
              type="number"
              min={0}
              max={15}
              value={form.sellTax}
              onChange={(e) => update('sellTax', Math.min(15, Number(e.target.value)))}
            />
          </div>
          {(form.buyTax > 0 || form.sellTax > 0) && (
            <FormInput
              label="Tax Wallet (blank = deployer address)"
              placeholder="0x…"
              value={form.taxWallet}
              onChange={(e) => update('taxWallet', e.target.value)}
            />
          )}
          {form.buyTax + form.sellTax > 10 && (
            <p className="text-xs text-yellow-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              High tax ({form.buyTax + form.sellTax}%) — most traders will avoid this token.
            </p>
          )}
        </FormSection>

        {}
        <FormSection id="modern" icon={Shield} title="Modern ERC-20 Extensions" expanded={expandedSections} onToggle={toggleSection}>
          <p className="text-xs text-slate-500 mb-3 leading-relaxed">
            Optional production-grade extensions — all self-contained, no OpenZeppelin imports.
            Enable only what you need; each adds ~200–800 bytes to bytecode.
          </p>
          {}
          <div className="space-y-2">
            <Toggle
              label="On-chain Logo URI"
              desc="Adds logoURI() — wallets, CoinGecko, and token lists read this to display your token logo"
              checked={!!form.logoURI}
              onChange={() => update('logoURI', form.logoURI ? '' : 'ipfs://')}
            />
            {form.logoURI !== undefined && form.logoURI !== '' && (
              <FormInput
                label="Logo URI"
                value={form.logoURI}
                onChange={e => update('logoURI', e.target.value)}
                placeholder="ipfs://QmXxx... or https://example.com/logo.png"
              />
            )}
          </div>
          <Toggle
            label="EIP-2612 Permit (gasless approvals)"
            desc="Sign-based approvals — no extra gas tx for the approve step. Used by Uniswap, 1inch, etc."
            checked={form.hasPermit}
            onChange={() => update('hasPermit', !form.hasPermit)}
          />
          <Toggle
            label="ERC-20 Votes (governance + delegation)"
            desc="Voting power checkpoints for DAO governance. Includes EIP-712 domain separator."
            checked={form.isGovernance}
            onChange={() => update('isGovernance', !form.isGovernance)}
          />
          <Toggle
            label="Flash Mint (ERC-3156)"
            desc="Allow flash loans of this token — borrow any amount atomically, must repay in same tx."
            checked={form.hasFlashMint}
            onChange={() => update('hasFlashMint', !form.hasFlashMint)}
          />
          <Toggle
            label="Address Blacklist"
            desc="Owner can block addresses from transferring. Useful for anti-bot protection or compliance."
            checked={form.hasBlacklist}
            onChange={() => update('hasBlacklist', !form.hasBlacklist)}
          />
          <Toggle
            label="Role-Based Access Control"
            desc="Separate MINTER_ROLE, PAUSER_ROLE, ADMIN_ROLE instead of single owner. Ideal for multi-sig / DAO."
            checked={form.useRoles}
            onChange={() => update('useRoles', !form.useRoles)}
          />
        </FormSection>

        <FormSection id="advanced" icon={Sliders} title="Advanced Features" expanded={expandedSections} onToggle={toggleSection}>
          <Toggle
            label="Burnable"
            desc="Holders can burn their tokens"
            checked={form.burnable}
            onChange={() => update('burnable', !form.burnable)}
          />
          <Toggle
            label="Pausable"
            desc="Owner can pause all transfers"
            checked={form.pausable}
            onChange={() => update('pausable', !form.pausable)}
          />
          <Toggle
            label="ERC-20 Permit (EIP-2612)"
            desc="Gasless approvals via signature"
            checked={form.permit}
            onChange={() => update('permit', !form.permit)}
          />
        </FormSection>
      </div>

      {}
      <div className="space-y-4">
        {}
        <div className="flex items-center gap-2 bg-slate-900 rounded-xl border border-slate-800 p-3">
          {stepLabels.map((label, i) => (
            <React.Fragment key={label}>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${i <= step ? 'text-white' : 'text-slate-600'}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                  i < step  ? 'bg-green-600 text-white'
                  : i === step ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-500'
                }`}>
                  {i < step ? '✓' : i + 1}
                </div>
                <span className="hidden sm:inline">{label}</span>
              </div>
              {i < stepLabels.length - 1 && (
                <div className={`flex-1 h-px ${i < step ? 'bg-green-600/40' : 'bg-slate-800'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {}
        <div className="bg-[#1e1e1e] rounded-xl border border-slate-800 overflow-hidden" style={{ minHeight: 280 }}>
          <div className="flex items-center justify-between px-4 py-2 bg-slate-950/80 border-b border-slate-800">
            <span className="text-xs text-slate-400 font-mono">
              {contractName ? `${contractName}.sol` : 'Contract Preview'}
            </span>
            <div className="flex gap-2 items-center">
              {generatedSource && (
                <button
                  onClick={() => copy(generatedSource)}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
                >
                  <Copy className="w-3 h-3" /> Copy
                </button>
              )}
              {generatedSource && !compiledData && (
                <button
                  onClick={handleCompile}
                  disabled={isCompiling}
                  className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700
                             disabled:opacity-50 text-white text-xs font-bold rounded transition-colors"
                >
                  {isCompiling
                    ? <><Loader2 className="w-3 h-3 animate-spin" /> Compiling…</>
                    : <><Zap className="w-3 h-3" /> Compile</>}
                </button>
              )}
            </div>
          </div>
          <div className="p-4 overflow-auto max-h-72">
            {generatedSource ? (
              <pre className="font-mono text-xs text-green-300 leading-relaxed whitespace-pre-wrap">
                {generatedSource}
              </pre>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-slate-600">
                <Code className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm">Configure your token and click "Generate Contract"</p>
                <p className="text-xs mt-1 opacity-60">All fields marked * are required</p>
              </div>
            )}
          </div>
        </div>

        {}
        {compiledData && (
          <div className="bg-slate-900 rounded-xl border border-green-500/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-sm font-bold text-green-400">Compiled Successfully</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs mb-4">
              <div className="bg-slate-950 p-3 rounded-lg">
                <p className="text-slate-500 mb-1">ABI Functions</p>
                <p className="text-white font-bold">
                  {compiledData.abi.filter((i: any) => i.type === 'function').length}
                </p>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg">
                <p className="text-slate-500 mb-1">Bytecode Size</p>
                <p className="text-white font-bold">
                  {Math.round(compiledData.bytecode.length / 2 / 1024)}KB
                </p>
              </div>
            </div>

            {deployedAddress ? (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="font-bold text-green-400 text-sm">
                    {form.symbol} deployed on {network.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-mono text-white flex-1 truncate">{deployedAddress}</p>
                  <button onClick={() => copy(deployedAddress)}>
                    <Copy className="w-3 h-3 text-slate-400 hover:text-white" />
                  </button>
                  <a href={`${network.explorerUrl}/address/${deployedAddress}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="w-3 h-3 text-blue-400 hover:text-blue-300" />
                  </a>
                </div>
                {deployTxHash && (
                  <a
                    href={`${network.explorerUrl}/tx/${deployTxHash}`}
                    target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                  >
                    View deployment TX <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button
                  onClick={() => {
                    setDeployedAddress(null); setCompiledData(null);
                    setGeneratedSource(null); setDeployTxHash('');
                  }}
                  className="w-full mt-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg
                             text-xs font-semibold transition-colors"
                >
                  Build Another Token
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={handleDeploy}
                  disabled={isDeploying || !walletAddress}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white
                             rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  {isDeploying
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Deploying…</>
                    : <><Rocket className="w-4 h-4" /> Deploy to {network.name}</>}
                </button>
                {!walletAddress && (
                  <p className="text-center text-xs text-yellow-400 mt-2 flex items-center justify-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Connect wallet to deploy
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
