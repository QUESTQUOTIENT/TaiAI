import React, { useEffect } from 'react';
import { useAppStore } from '../store';
import {
  CheckCircle2, Wallet, ExternalLink, Layers, FileJson, Cloud, Code, Zap,
  Store, AlertCircle, ArrowRight, ArrowLeftRight, Droplets, Coins, BarChart3,
  TrendingUp, Shield, Rocket, Wand2, Image,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { DashboardAnalytics } from '../components/dashboard/DashboardAnalytics';
import { isSolanaNetwork } from '../types';


const NFT_STEPS_EVM = [
  { num: '01', title: 'Build Assets',          path: '/assets',    description: 'Generative builder with layered traits, rarity weights, and Legendary 1-of-1s.', icon: Layers,   check: (s: any) => s.generatedCollection.length > 0 || s.assets.length > 0 },
  { num: '02', title: 'Configure Metadata',    path: '/metadata',  description: 'Set royalties (ERC-2981), collection details, validate and export numbered JSONs.', icon: FileJson, check: (s: any) => !!(s.collectionMetadata.name && s.collectionMetadata.description) },
  { num: '03', title: 'Upload to IPFS',        path: '/ipfs',      description: 'Images first → get CID → update metadata → upload metadata → get Base URI.', icon: Cloud,    check: (s: any) => !!s.ipfsCid },
  { num: '04', title: 'Deploy Contract',       path: '/deploy',    description: 'Guided 5-step wizard: pick template, configure, compile, deploy. No code needed.', icon: Code,     check: (s: any) => !!s.deployedAddress },
  { num: '05', title: 'Manage Minting',        path: '/minting',   description: 'Mint phases, Merkle allowlist, airdrop, reveal, Mint Zone, and withdraw revenue.', icon: Zap,      check: () => false },
  { num: '06', title: 'Gallery & Marketplace', path: '/gallery',   description: 'Browse minted NFTs, verify on explorer, list on Minted & Ebisu\'s Bay.', icon: Store,    check: () => false },
];

const NFT_STEPS_SOLANA = [
  { num: '01', title: 'Build Assets',         path: '/assets',   description: 'Same generative engine — layered traits, rarity weights, Legendary 1-of-1s.', icon: Layers,   check: (s: any) => s.generatedCollection.length > 0 || s.assets.length > 0 },
  { num: '02', title: 'Configure Metadata',   path: '/metadata', description: 'Set royalties (basis points), collection name, description. Export Metaplex-compatible JSONs.', icon: FileJson, check: (s: any) => !!(s.collectionMetadata.name && s.collectionMetadata.description) },
  { num: '03', title: 'Upload to IPFS',       path: '/ipfs',     description: 'Upload images and metadata to IPFS via Lighthouse, Pinata, or Infura. Works identically for Solana.', icon: Cloud,    check: (s: any) => !!s.ipfsCid },
  { num: '04', title: 'Mint NFT / Collection',path: '/minting',  description: 'Single NFT via Metaplex Token Metadata, or full collection via Candy Machine v3.', icon: Zap,      check: () => false },
  { num: '05', title: 'NFT Gallery',          path: '/gallery',  description: 'Browse your Solana NFTs, verify on Solscan.', icon: Image,    check: () => false },
  { num: '06', title: 'Analytics',            path: '/analytics',description: 'Track supply, holder distribution, mint activity for your SPL token or NFT collection.', icon: BarChart3,check: () => false },
];


const DEFI_TOOLS_EVM = [
  { title: 'Token Swap',      path: '/swap',      icon: ArrowLeftRight, color: 'blue',   description: 'Swap any token pair via VVS Finance. Real-time getAmountsOut quotes.' },
  { title: 'Liquidity',       path: '/liquidity', icon: Droplets,       color: 'cyan',   description: 'Add/remove VVS Finance LP positions. Pool reserves and price tracking.' },
  { title: 'Token Creator',   path: '/token',     icon: Coins,          color: 'purple', description: 'Deploy ERC-20 with tax, burn, pause, permit and renounce controls.' },
  { title: 'Analytics',       path: '/analytics', icon: BarChart3,      color: 'green',  description: 'Live mint activity, holder distribution, contract revenue tracking.' },
];

const DEFI_TOOLS_SOLANA = [
  { title: 'Token Swap',      path: '/swap',      icon: ArrowLeftRight, color: 'purple', description: 'Swap any SPL token pair via Jupiter Aggregator — routes through 20+ Solana AMMs.' },
  { title: 'Liquidity',       path: '/liquidity', icon: Droplets,       color: 'violet', description: 'Add/remove Raydium liquidity positions. Pool discovery and APR tracking.' },
  { title: 'SPL Token',       path: '/token',     icon: Coins,          color: 'indigo', description: 'Deploy SPL tokens with decimals, initial supply, and optional fixed-supply lock.' },
  { title: 'Analytics',       path: '/analytics', icon: BarChart3,      color: 'green',  description: 'On-chain analytics: SPL token supply, holder stats, mint and transfer history.' },
];

const QUICK_ACTIONS_EVM = [
  { title: '🧙 Deploy Wizard', path: '/deploy',    description: 'Guided no-code contract deployment' },
  { title: '🖼️ NFT Gallery',   path: '/gallery',   description: 'Browse your minted NFT collection' },
  { title: '🌐 Mint Zone',     path: '/minting',   description: 'Public community mint page' },
  { title: '🚀 Launchpad',     path: '/launchpad', description: 'Manage any NFT collection' },
];

const QUICK_ACTIONS_SOLANA = [
  { title: '🎨 Build NFTs',    path: '/assets',   description: 'Start generative art for Solana' },
  { title: '📤 Upload IPFS',   path: '/ipfs',     description: 'Upload art and metadata' },
  { title: '⚡ Mint NFTs',     path: '/minting',  description: 'Metaplex single or Candy Machine' },
  { title: '🔍 Analytics',     path: '/analytics',description: 'SPL token and NFT on-chain stats' },
];

const COLOR_CLASSES: Record<string, { bg: string; icon: string }> = {
  blue:   { bg: 'bg-blue-500/10',   icon: 'text-blue-400' },
  cyan:   { bg: 'bg-cyan-500/10',   icon: 'text-cyan-400' },
  purple: { bg: 'bg-purple-500/10', icon: 'text-purple-400' },
  violet: { bg: 'bg-violet-500/10', icon: 'text-violet-400' },
  indigo: { bg: 'bg-indigo-500/10', icon: 'text-indigo-400' },
  green:  { bg: 'bg-green-500/10',  icon: 'text-green-400' },
};

export function Dashboard() {
  const {
    walletAddress, solanaWalletAddress, network, setWalletAddress,
    generatedCollection, assets, collectionMetadata,
    ipfsCid, deployedAddress, addNotification,
  } = useAppStore();

  const isSolana = isSolanaNetwork(network);
  const activeWallet = isSolana ? solanaWalletAddress : walletAddress;

  
  useEffect(() => {
    if ((window as any).ethereum && !walletAddress) {
      (window as any).ethereum.request({ method: 'eth_accounts' })
        .then((accounts: string[]) => { if (accounts.length > 0) setWalletAddress(accounts[0]); })
        .catch(() => {});
    }
    const handleAccountsChanged = (accounts: string[]) => setWalletAddress(accounts[0] || '');
    (window as any).ethereum?.on('accountsChanged', handleAccountsChanged);
    return () => { (window as any).ethereum?.removeListener('accountsChanged', handleAccountsChanged); };
  }, []);

  const store = { generatedCollection, assets, collectionMetadata, ipfsCid, deployedAddress };
  const nftSteps = isSolana ? NFT_STEPS_SOLANA : NFT_STEPS_EVM;
  const defiTools = isSolana ? DEFI_TOOLS_SOLANA : DEFI_TOOLS_EVM;
  const quickActions = isSolana ? QUICK_ACTIONS_SOLANA : QUICK_ACTIONS_EVM;

  const getStatus = (step: typeof nftSteps[0]) => {
    if (step.check(store)) return 'completed';
    const idx = nftSteps.indexOf(step);
    if (idx === 0) return 'current';
    return nftSteps[idx - 1].check(store) ? 'current' : 'pending';
  };

  const completedCount = nftSteps.filter((s) => s.check(store)).length;

  return (
    <div className="space-y-8">
      {}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-white">Crolana</h1>
            {isSolana && (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-purple-500/15 border border-purple-500/25 rounded-full text-xs font-bold text-purple-300">
                ◎ Solana {network.isTestnet ? 'Devnet' : 'Mainnet'}
              </span>
            )}
          </div>
          <p className="text-slate-400 text-sm">
            {isSolana
              ? 'NFT Launchpad + DeFi Toolkit — full Solana workflow via Phantom + Jupiter + Raydium.'
              : 'NFT Launchpad + DeFi Toolkit — everything you need to build on Cronos.'}
          </p>
        </div>
        <Link to="/about" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors">
          How it works
        </Link>
      </div>

      {}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
          <p className="text-slate-500 text-xs uppercase font-semibold mb-2 tracking-wide">
            {isSolana ? 'Phantom Wallet' : 'Wallet'}
          </p>
          {activeWallet ? (
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isSolana ? 'bg-purple-500' : 'bg-green-500'}`} />
              <span className="text-white font-mono text-sm">{activeWallet.slice(0, 6)}…{activeWallet.slice(-4)}</span>
            </div>
          ) : (
            <p className="text-slate-500 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-500" />
              {isSolana ? 'Connect Phantom wallet in header' : 'Use the header Connect button'}
            </p>
          )}
        </div>
        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
          <p className="text-slate-500 text-xs uppercase font-semibold mb-2 tracking-wide">Network</p>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${
              isSolana ? (network.isTestnet ? 'bg-orange-400' : 'bg-purple-400')
                       : (network.isTestnet ? 'bg-yellow-500' : 'bg-green-500')
            }`} />
            <span className="text-white font-medium text-sm">{network.name}</span>
            {network.isTestnet && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                isSolana ? 'bg-orange-500/20 text-orange-400' : 'bg-yellow-500/20 text-yellow-400'
              }`}>TESTNET</span>
            )}
          </div>
        </div>
        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
          <p className="text-slate-500 text-xs uppercase font-semibold mb-2 tracking-wide">NFT Launch Progress</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
              <div className={`h-2 rounded-full transition-all duration-700 ${isSolana ? 'bg-purple-500' : 'bg-blue-500'}`}
                style={{ width: `${(completedCount / nftSteps.length) * 100}%` }} />
            </div>
            <span className="text-white text-sm font-bold tabular-nums">{completedCount}/{nftSteps.length}</span>
          </div>
        </div>
      </div>

      {}
      {isSolana ? (
        <div className="flex items-start gap-3 p-4 bg-purple-500/8 border border-purple-500/20 rounded-xl text-sm">
          <span className="text-purple-400 text-base flex-shrink-0">◎</span>
          <div>
            <p className="text-purple-300 font-semibold">Solana mode active — using Phantom + Metaplex + Jupiter</p>
            <p className="text-purple-400/60 mt-0.5 text-xs">
              {network.isTestnet
                ? 'Devnet mode: get free SOL from https://faucet.solana.com. All Solana features work on Devnet.'
                : 'Connect your Phantom wallet to access all Solana features. Always test on Devnet first.'}
            </p>
          </div>
        </div>
      ) : !deployedAddress ? (
        <div className="flex items-start gap-3 p-4 bg-yellow-500/8 border border-yellow-500/20 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-300 font-semibold">Always test on Cronos Testnet first</p>
            <p className="text-yellow-400/60 mt-0.5 text-xs">Switch to Testnet (Chain ID 338) in the header. Get free TCRO from faucet.cronos.org and verify your full minting flow before going to Mainnet.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-4 p-4 bg-green-500/8 border border-green-500/20 rounded-xl">
            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-green-400 font-bold text-sm">Contract Live on {network.name}</p>
              <p className="text-green-300/50 font-mono text-xs truncate">{deployedAddress}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => { navigator.clipboard.writeText(deployedAddress); addNotification({ type: 'success', title: 'Copied', message: 'Contract address copied.', duration: 2000 }); }}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors" title="Copy address">
                <Shield className="w-3.5 h-3.5" />
              </button>
              <a href={`${network.explorerUrl}/address/${deployedAddress}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors">
                Explorer <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              {isSolana && <span className="text-purple-400">◎</span>}
              NFT Launch Workflow
            </h2>
            <p className="text-slate-500 text-xs mt-0.5">
              {isSolana ? 'From generative art to live Solana NFT — Metaplex + Candy Machine' : 'Six steps from generative art to live marketplace listing'}
            </p>
          </div>
          <span className="text-xs text-slate-500">{completedCount} of {nftSteps.length} complete</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {nftSteps.map((step) => {
            const status = getStatus(step);
            const Icon = step.icon;
            const activeColor = isSolana ? {
              completed: 'bg-purple-500/5 border-purple-500/25 hover:border-purple-500/50',
              current:   'bg-purple-600/5 border-purple-500/35 hover:border-purple-500/70 shadow-lg shadow-purple-900/10',
              bg: { completed: 'bg-purple-500/15', current: 'bg-purple-500/15', pending: 'bg-slate-800' },
              icon: { completed: 'text-purple-400', current: 'text-purple-400', pending: 'text-slate-500' },
              label: { completed: 'text-purple-500', current: 'text-purple-400', pending: 'text-slate-600' },
              cta:   { completed: 'text-purple-400', current: 'text-purple-400', pending: 'text-slate-600' },
            } : {
              completed: 'bg-green-500/5 border-green-500/25 hover:border-green-500/50',
              current:   'bg-blue-600/5 border-blue-500/35 hover:border-blue-500/70 shadow-lg shadow-blue-900/10',
              bg: { completed: 'bg-green-500/15', current: 'bg-blue-500/15', pending: 'bg-slate-800' },
              icon: { completed: 'text-green-400', current: 'text-blue-400', pending: 'text-slate-500' },
              label: { completed: 'text-green-500', current: 'text-blue-400', pending: 'text-slate-600' },
              cta:   { completed: 'text-green-400', current: 'text-blue-400', pending: 'text-slate-600' },
            };
            return (
              <Link key={step.path + step.num} to={step.path}
                className={`group relative p-5 rounded-xl border transition-all hover:shadow-lg ${
                  status === 'completed' ? activeColor.completed :
                  status === 'current'   ? activeColor.current :
                  'bg-slate-900 border-slate-800 hover:border-slate-600 opacity-55 hover:opacity-85'
                }`}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2.5 rounded-xl ${activeColor.bg[status]}`}>
                    <Icon className={`w-5 h-5 ${activeColor.icon[status]}`} />
                  </div>
                  {status === 'completed'
                    ? <CheckCircle2 className={`w-4 h-4 ${activeColor.icon.completed}`} />
                    : status === 'current'
                    ? <div className={`w-2 h-2 rounded-full mt-1 animate-pulse ${isSolana ? 'bg-purple-500' : 'bg-blue-500'}`} />
                    : <div className="w-2 h-2 rounded-full bg-slate-700 mt-1" />}
                </div>
                <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${activeColor.label[status]}`}>Step {step.num}</p>
                <p className="text-white font-bold text-sm mb-1.5">{step.title}</p>
                <p className="text-slate-500 text-xs leading-snug mb-3">{step.description}</p>
                <div className={`flex items-center gap-1 text-xs font-semibold ${activeColor.cta[status]}`}>
                  {status === 'completed' ? <><CheckCircle2 className="w-3 h-3" /> Done</> :
                   status === 'current'   ? <>Open <ArrowRight className="w-3 h-3" /></> : 'Locked'}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {}
      <div>
        <h2 className="text-lg font-bold text-white mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((q) => (
            <Link key={q.path + q.title} to={q.path}
              className={`group p-4 rounded-xl border transition-all ${
                isSolana
                  ? 'border-purple-500/20 bg-purple-600/5 hover:bg-purple-600/10 hover:border-purple-500/40'
                  : 'border-blue-500/20 bg-blue-600/5 hover:bg-blue-600/10 hover:border-blue-500/40'
              }`}>
              <p className="text-white font-bold text-sm mb-1">{q.title}</p>
              <p className="text-slate-500 text-xs leading-snug">{q.description}</p>
              <div className={`flex items-center gap-1 text-xs font-semibold mt-3 group-hover:gap-2 transition-all ${
                isSolana ? 'text-purple-400' : 'text-blue-400'
              }`}>
                Open <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              {isSolana && <span className="text-purple-400">◎</span>}
              DeFi Toolkit
            </h2>
            <p className="text-slate-500 text-xs mt-0.5">
              {isSolana
                ? 'Jupiter swap, Raydium liquidity, SPL token creation — connected to your Phantom wallet'
                : 'Swap tokens, manage liquidity, deploy ERC-20s — all connected to your Cronos wallet'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {defiTools.map((tool) => {
            const Icon = tool.icon;
            const c = COLOR_CLASSES[tool.color] ?? COLOR_CLASSES.blue;
            return (
              <Link key={tool.path + tool.title} to={tool.path}
                className="group p-5 rounded-xl border border-slate-800 bg-slate-900 hover:border-slate-600 hover:shadow-lg transition-all">
                <div className={`p-2.5 rounded-xl ${c.bg} mb-4 w-fit`}>
                  <Icon className={`w-5 h-5 ${c.icon}`} />
                </div>
                <p className="text-white font-bold text-sm mb-1.5">{tool.title}</p>
                <p className="text-slate-500 text-xs leading-snug mb-3">{tool.description}</p>
                <div className={`flex items-center gap-1 text-xs font-semibold ${c.icon}`}>
                  Open <ArrowRight className="w-3 h-3" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {}
      {!isSolana && deployedAddress && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Live Analytics</h2>
            <Link to="/analytics" className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1">
              Full analytics <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <DashboardAnalytics />
        </div>
      )}
    </div>
  );
}
export default Dashboard;
