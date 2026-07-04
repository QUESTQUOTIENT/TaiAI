import React, { useState } from 'react';
import {
  Layers, Upload, Database, Code, Zap, BarChart2, ArrowLeftRight, Droplets,
  Coins, Shield, Globe, ChevronDown, ChevronUp, ExternalLink,
  Package, Server, CheckCircle, Bot, Wallet, Palette, Network, Repeat2,
} from 'lucide-react';


const DiscordIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.031.056a19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
  </svg>
);

const XIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.736-8.856L2.077 2.25h7.262l4.259 5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const FEATURE_SYSTEMS = [
  {
    num: '01', icon: Layers, color: 'blue',
    title: 'NFT Generator Engine',
    subtitle: 'packages/nft-engine',
    description: 'Full-stack generative NFT engine with deterministic DNA hashing to guarantee uniqueness across an entire collection. Upload trait layers as PNG files, optionally embed rarity weights in filenames using the #weight syntax. Images are composited on an HTML Canvas at full resolution server-side. The completed collection exports as a ZIP containing sequentially numbered images and correctly structured JSON metadata files ready for IPFS upload.',
    features: [
      'Up to 10k collection generation with progress tracking',
      'Weighted rarity per trait layer (1–100 weight scale)',
      'DNA uniqueness via sorted attribute hashing — zero duplicates',
      'Legendary 1-of-1 token injection at any position',
      'Automatic rarity scoring and rank ordering across collection',
      'Canvas-based image compositing at source resolution',
    ],
  },
  {
    num: '02', icon: Upload, color: 'cyan',
    title: 'IPFS Asset Manager',
    subtitle: 'packages/ipfs',
    description: 'Managed IPFS upload pipeline supporting Lighthouse, Pinata, and Infura as storage providers. Images and metadata are uploaded as separate directories to preserve the ipfs://<CID>/<id>.json URI structure required by NFT marketplaces. CID verification confirms your uploads are gateway-accessible before proceeding. API keys are AES-256 encrypted on the server — never exposed to the client.',
    features: [
      'Lighthouse, Pinata, Infura storage provider support',
      'Batch image and metadata directory upload with queue',
      'CID verification and public gateway preview link',
      'AES-256 encrypted API key storage (server-side only)',
      'Upload progress bar with per-file status tracking',
      'Hidden metadata URI for pre-reveal collections',
    ],
  },
  {
    num: '03', icon: Code, color: 'green',
    title: 'Smart Contract Builder',
    subtitle: 'packages/contracts',
    description: 'Browser-side Solidity source generation paired with server-side solc compilation. Contracts inherit directly from the OpenZeppelin standard library ensuring audit-grade security with no bespoke dependencies. All transaction signing happens exclusively in your browser wallet — the server never receives private keys or seed phrases. Supports automatic Cronos Explorer source verification post-deployment.',
    features: [
      'ERC-721, ERC-721A (gas-optimised batch mint), ERC-1155, ERC-20',
      'EIP-2981 royalty standard built-in (marketplace-compatible)',
      'Full reveal system: hidden URI → baseURI reveal on-chain',
      'Allowlist (Merkle proof), public, and owner mint phases',
      'Pausable, burnable, max supply, per-wallet mint caps',
      'Automatic Cronos Explorer contract verification',
    ],
  },
  {
    num: '04', icon: Zap, color: 'yellow',
    title: 'Mint Launchpad',
    subtitle: 'services/mint-engine',
    description: 'Complete minting control panel for live deployed contracts. Set public or allowlist mint prices and caps, generate Merkle proofs from CSV address lists, owner-mint specific token IDs, airdrop to multiple wallets via CSV import, trigger the reveal by updating the baseURI on-chain, and withdraw accumulated mint revenue — all executed as on-chain transactions through your connected wallet.',
    features: [
      'Public and allowlist (Merkle proof) mint phase management',
      'CSV → Merkle root generation — up to 50k addresses',
      'Owner mint to specific wallet addresses',
      'Bulk airdrop from CSV wallet list',
      'Pause / unpause mint phase toggle',
      'Reveal trigger (baseURI update) and revenue withdrawal',
    ],
  },
  {
    num: '05', icon: ArrowLeftRight, color: 'blue',
    title: 'Token Swap Engine',
    subtitle: 'packages/swap-engine',
    description: 'Swap any token pair on Cronos via the VVS Finance router (a Uniswap V2 fork). Real-time price quotes are fetched directly from the on-chain router using getAmountsOut. Price impact is calculated from live pool reserves. Slippage tolerance and transaction deadline are fully configurable. ERC-20 token approvals are handled automatically before swap execution. Works on both mainnet and testnet — on testnet, add liquidity first to create a pool.',
    features: [
      'VVS Finance routing (Uniswap V2 compatible)',
      'Real-time getAmountsOut price quotes from on-chain router',
      'Price impact calculated from live pool reserves',
      'Configurable slippage (0.1% – 50%) and deadline',
      'CRO ↔ Token and Token ↔ Token swap paths',
      'Automatic ERC-20 max approval before swap execution',
    ],
  },
  {
    num: '06', icon: Droplets, color: 'cyan',
    title: 'Liquidity Manager',
    subtitle: 'packages/liquidity-engine',
    description: 'Full liquidity position management for VVS Finance pools. Add liquidity to existing pools or create brand-new pools permissionlessly via the factory contract. The amount-B field auto-calculates from current pool ratio to prevent unfavourable price impact. Remove liquidity by percentage with a real-time LP token calculation. On testnet, users can deploy their own test tokens and seed new pools for development and testing.',
    features: [
      'Add liquidity — CRO+Token or Token+Token pairs',
      'Create new pools via factory.createPair() permissionlessly',
      'Auto-calculated proportional token amounts (maintains pool ratio)',
      'Remove liquidity with 1–100% slider and LP token preview',
      'Pool reserves, price ratio, and your LP balance displayed',
      'Testnet: seed your own pools for development testing',
    ],
  },
  {
    num: '07', icon: Coins, color: 'purple',
    title: 'Token Creator Engine',
    subtitle: 'packages/token-engine',
    description: 'Deploy fully featured ERC-20 tokens with a visual configurator — no coding required. Configure tax rates, per-wallet and per-transaction trading limits, ownership controls, and advanced tokenomics features. Solidity source is generated client-side, compiled server-side with solc, and deployed via your MetaMask wallet. Optionally renounce contract ownership immediately after deployment for a trustless launch.',
    features: [
      'Custom name, symbol, total supply, and decimals',
      'Buy/sell tax configuration (up to 15% each)',
      'Max wallet percentage and max transaction percentage limits',
      'Burnable, pausable, permit (EIP-2612 gasless approvals)',
      'Ownable with one-click ownership renouncement',
      'Trading enable/disable switch for post-deployment control',
    ],
  },
  {
    num: '08', icon: BarChart2, color: 'orange',
    title: 'Analytics Indexer',
    subtitle: 'services/analytics-indexer',
    description: 'On-chain analytics powered entirely by direct Cronos RPC calls — no external indexing API needed. Reads Transfer event logs to derive minting activity, unique holder counts, and holder distribution charts. Refreshes every 10 seconds while your contract is active. Tracks contract CRO balance (withdrawable revenue) in real time. All data sourced directly from the blockchain for complete transparency.',
    features: [
      'Transfer event log parsing for mint and transfer activity',
      'Mint activity bar chart (configurable date range)',
      'Holder distribution pie chart by balance tier',
      'Unique owner address estimation from Transfer events',
      'Contract CRO balance tracking (withdrawable revenue)',
      'Live polling indicator — no external API dependency',
    ],
  },
  {
    num: '09', icon: Bot, color: 'green',
    title: 'AI Assistant',
    subtitle: 'components/AIAssistant',
    description: 'Context-aware AI assistant embedded in the bottom-left of every page. Operates in three modes: App Mode answers questions about Crolana features and guides you step-by-step through workflows. Code Mode helps you write, audit, and debug Solidity smart contracts. General Mode handles open-ended blockchain and crypto questions. Powered by Claude (Anthropic) via the server API — all queries are processed server-side.',
    features: [
      'App Mode: step-by-step guidance on all Crolana features',
      'Code Mode: Solidity contract writing, auditing, and debugging',
      'General Mode: open blockchain and crypto Q&A',
      'Context-aware — knows which features are active',
      'Floating widget — accessible from every page without navigation',
      'Conversation history preserved within the session',
    ],
  },
  {
    num: '10', icon: Wallet, color: 'blue',
    title: 'Wallet Asset Panel',
    subtitle: 'components/Header',
    description: 'A live token portfolio panel embedded directly in the wallet dropdown in the app header. Displays every token on the active network alongside your real-time on-chain balance. Tokens with a positive balance are highlighted and sorted to the top; zero-balance tokens are displayed below. Also appears in the Token Selector modal in Swap and Liquidity Manager, showing your balances alongside each selectable token.',
    features: [
      'Live ERC-20 balances for all network tokens in header dropdown',
      'Native CRO/TCRO balance displayed in wallet button',
      'Tokens with balance sorted above zero-balance tokens',
      'Refresh button for manual on-demand balance update',
      'Auto-refreshes every 30 s while wallet is connected',
      'Token balances shown inline inside Swap and Liquidity token pickers',
    ],
  },
  {
    num: '11', icon: Palette, color: 'purple',
    title: 'Theme System',
    subtitle: 'components/Settings',
    description: 'A full-app theme engine with seven built-in presets and a custom mode. Themes are stored in localStorage and applied instantly via CSS custom properties — no page reload required. Custom mode lets you individually configure every surface colour, accent colour, border, and text shade with a live colour picker that updates the entire interface in real time. The Cronos preset is designed to match the app logo colour palette.',
    features: [
      'Seven built-in presets: Midnight, Obsidian, Forest, Flame, Arctic, Rose, Cronos',
      'Custom mode: live colour picker for 12 individual UI variables',
      'Instant apply — CSS variable updates with no reload',
      'Theme persisted across sessions via localStorage',
      'Accent colour propagates to all buttons, borders, and highlights',
      'Cronos preset: emerald green + cyan inspired by the app logo',
    ],
  },
  {
    num: '12', icon: Network, color: 'yellow',
    title: 'Multi-Network Support',
    subtitle: 'store/network',
    description: 'Full dual-network support for Cronos Mainnet (Chain ID 25) and Cronos Testnet (Chain ID 338). Every feature — NFT generation, contract deployment, swap, liquidity, and analytics — works on both networks. One-click network switching adds the selected network to MetaMask automatically if not already configured. Custom networks can be added manually in Settings for development and staging environments.',
    features: [
      'Cronos Mainnet (Chain 25) and Testnet (Chain 338) built-in',
      'One-click MetaMask network switching with auto-add',
      'All contract, swap, and liquidity operations are network-aware',
      'Testnet faucet link for free TCRO test funds',
      'Custom network configuration in Settings',
      'Network indicator badge always visible in app header',
    ],
  },
  {
    num: '13', icon: Repeat2, color: 'purple',
    title: 'Jupiter Swap (Solana)',
    subtitle: 'pages/SolanaSwap',
    description: 'Token swap on Solana via Jupiter Aggregator — the leading liquidity aggregator routing through Raydium, Orca, Whirlpools, Meteora, Phoenix, and 20+ other AMMs. Jupiter finds the best execution price across the entire Solana DeFi ecosystem. Quotes are fetched from the Jupiter V6 REST API in real-time. Transactions are serialised by Jupiter, signed by Phantom, and submitted directly to the Solana cluster.',
    features: [
      'Jupiter V6 API routing through 20+ Solana AMMs and CLOBs',
      'Real-time price quotes with configurable slippage (bps)',
      'Native SOL and any SPL token pair supported',
      'Price impact from route plan shown before execution',
      'Versioned transaction deserialization via @solana/web3.js',
      'Works on both Mainnet and Devnet',
    ],
  },
  {
    num: '14', icon: Droplets, color: 'cyan',
    title: 'Raydium Liquidity (Solana)',
    subtitle: 'pages/SolanaLiquidity',
    description: 'Liquidity pool management for Solana via the Raydium REST API. Browse top-TVL Raydium Standard and CLMM pools with live APR and 24h volume. Add liquidity to any SOL/token or token/token pair. Remove liquidity by percentage with LP token calculation. Raydium returns serialised transactions — Phantom signs and submits them. No Raydium SDK is bundled: the app uses Raydium API + @solana/web3.js only.',
    features: [
      'Browse top Raydium pools by TVL, volume, and APR',
      'Standard AMM V4 and Concentrated (CLMM) pool support',
      'Add liquidity to any SOL+token or token/token pair',
      'Remove liquidity with 10–100% percentage slider',
      'Live pool price ratio and LP position tracking',
      'Serialised-tx approach: no Raydium SDK bundled',
    ],
  },
  {
    num: '15', icon: Coins, color: 'purple',
    title: 'SPL Token Creator (Solana)',
    subtitle: 'pages/SolanaTokenBuilder',
    description: 'Deploy Solana SPL tokens without writing any code. Configure name, symbol, decimals (0-9), and initial supply. Revoke mint authority to make supply permanently fixed (equivalent to ERC-20 ownership renouncement). Revoke freeze authority so tokens can never be frozen by anyone. On-chain Metaplex Token Metadata is created for marketplace and wallet visibility. Supports both Mainnet and Devnet.',
    features: [
      'SPL token mint creation via @solana/spl-token',
      'Custom name, symbol, decimals (0-9), and initial supply',
      'Revoke mint authority — permanently fixed supply',
      'Revoke freeze authority — tokens can never be frozen',
      'Metaplex Token Metadata for on-chain name/symbol',
      'Bulk airdrop to Solana addresses via CSV import',
    ],
  },
  {
    num: '16', icon: Zap, color: 'orange',
    title: 'Metaplex NFT Minting (Solana)',
    subtitle: 'pages/SolanaMinting',
    description: 'Solana NFT minting powered by Metaplex Token Metadata and Candy Machine v3. Single NFT mode mints one token directly. Candy Machine mode deploys a full collection launchpad with configurable supply, mint price in SOL or any SPL token, and guard phases (start/end dates, allowlists, mint limits). The generative art generation and IPFS upload workflow is identical to Cronos — only this final on-chain step differs.',
    features: [
      'Single NFT mint via Metaplex mpl-token-metadata',
      'Candy Machine v3 collection launchpad (up to 10k)',
      'Configurable mint price in SOL or any SPL token',
      'Guard phases: start date, end date, allowlist, per-wallet limit',
      'Identical generative art and IPFS pipeline as EVM workflow',
      'Devnet testing with free SOL from faucet.solana.com',
    ],
  },
  {
    num: '17', icon: BarChart2, color: 'green',
    title: 'Solana Analytics',
    subtitle: 'pages/SolanaAnalytics',
    description: 'On-chain analytics for SPL tokens and Solana NFT collections via the Solana JSON-RPC API — no external API key needed. Enter any SPL mint address to fetch supply, decimals, mint/freeze authority status, and largest holders. Transfer signature history is parsed to derive mint activity over time. Charts show holder distribution and recent activity. NFT collection analytics tracks supply and holder stats.',
    features: [
      'SPL token supply, decimals, authority status at a glance',
      'Largest holder list with percentage share',
      'Holder distribution pie chart by balance tier',
      'Transfer signature history for activity tracking',
      'NFT collection analytics: supply and holder distribution',
      'Direct Solana JSON-RPC — no third-party indexer needed',
    ],
  },
];

const FAQ = [
  { q: 'Do I need to code anything?', a: 'No. Crolana generates all Solidity source code, compiles it on the server, and sends deployment transactions through your browser wallet. Every step has a visual interface.' },
  { q: 'Where are my private keys?', a: 'Your private keys never leave your browser wallet (MetaMask, Crypto.com DeFi Wallet, etc.). The server compiles contracts and generates Merkle proofs, but all transaction signing happens client-side.' },
  { q: 'How is IPFS API key storage handled?', a: 'API keys are AES-256 encrypted using a server-side ENCRYPTION_KEY environment variable before being stored in the database. They are decrypted only at upload time on the server and are never sent back to the client.' },
  { q: 'Which DEX does swap and liquidity use?', a: 'VVS Finance (router: 0x145863…) — a Uniswap V2 fork and the primary DEX on Cronos Mainnet. On Cronos Testnet, a compatible Uniswap V2 router is used. Both networks share the same code path.' },
  { q: 'What is ERC-721A and should I use it?', a: 'ERC-721A is a gas-optimised ERC-721 implementation by Chiru Labs that dramatically reduces gas costs for batch minting. Use it for collections of 1,000+ tokens or when users will mint multiple tokens per transaction.' },
  { q: 'What is the testnet faucet URL?', a: 'https://cronos.org/faucet — request free TCRO (testnet CRO) to test your full minting flow including gas fees before deploying to Mainnet.' },
  { q: 'Can I add liquidity for my own deployed token?', a: 'Yes — the Liquidity Manager accepts any ERC-20 address. Once you deploy your ERC-20 via the Token Creator, you can pair it with CRO or any other token to create a brand-new VVS Finance pool.' },
  { q: 'How do Merkle proof allowlists work?', a: 'Upload a CSV of eligible wallet addresses in the Minting tab. The app builds a Merkle tree on the server, returns the root hash for you to set on-chain, and provides a proof API that your frontend mint page can use to let allowlisted wallets mint.' },
  { q: 'How does the AI Assistant work?', a: 'The AI Assistant is powered by Claude (Anthropic) via the server API. It operates in three modes: App (Crolana guidance), Code (Solidity help), and General (blockchain Q&A). Conversations are session-scoped and queries are processed server-side — no OpenAI or third-party key needed in your frontend.' },
  { q: 'Can I use the app on testnet before spending real CRO?', a: 'Yes — switch to Cronos Testnet in the header. All features work identically. Get free TCRO from the faucet, deploy a test token, add liquidity, and run a full swap cycle before touching Mainnet.' },
  { q: 'How do I switch to Solana mode?', a: 'Click the network name in the header and select Solana Mainnet or Solana Devnet. The entire app switches to Solana mode: the wallet button becomes a Phantom connector, Swap routes through Jupiter, Liquidity shows Raydium pools, Token Builder creates SPL tokens, and Minting uses Metaplex. Switch back to Cronos Mainnet or Testnet at any time.' },
  { q: 'What wallet do I need for Solana?', a: 'Phantom is the recommended Solana wallet — it handles both NFTs and DeFi operations. Solflare and Backpack are also supported. Download Phantom at phantom.app. On Devnet, get free SOL from faucet.solana.com.' },
  { q: 'How does Jupiter Swap work vs VVS Finance?', a: 'For Cronos, Swap routes through VVS Finance (a Uniswap V2 fork) calling getAmountsOut on-chain. For Solana, Swap uses the Jupiter Aggregator V6 REST API which finds the best route across 20+ AMMs including Raydium, Orca, and Meteora. Jupiter handles routing complexity so you always get the best price.' },
  { q: 'Can I create an NFT collection on both chains?', a: 'Yes — the generative art engine and IPFS upload workflow are completely chain-agnostic. You build and export your collection the same way on both chains. On Cronos you deploy an ERC-721/721A contract and mint from it. On Solana you use Metaplex Token Metadata (single NFTs) or Candy Machine v3 (full collection launchpad).' },
];

export function About() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [openSystem, setOpenSystem] = useState<number | null>(0);

  return (
    <div className="space-y-12 max-w-4xl">
      {}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h1 className="text-4xl font-black text-white leading-tight">Crolana</h1>
        </div>
        <p className="text-slate-400 text-lg leading-relaxed mb-6 max-w-2xl">
          A dual-chain NFT + DeFi launchpad for Cronos and Solana. Seventeen integrated systems covering generative art, IPFS upload, smart contract deployment, minting, token swaps, liquidity management, token creation, analytics, and a built-in AI assistant — with full feature parity across both blockchains.
        </p>
        <div className="flex flex-wrap gap-3">
          {[
            { icon: Shield, label: 'Keys never leave your wallet', color: 'green' },
            { icon: Server, label: 'Server-side solc compilation', color: 'blue' },
            { icon: Globe, label: 'Cronos + Solana Networks', color: 'purple' },
            { icon: Package, label: 'OpenZeppelin standard contracts', color: 'orange' },
            { icon: Bot, label: 'Built-in AI assistant', color: 'cyan' },
          ].map(({ icon: Icon, label, color }) => (
            <div key={label} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border
              ${color === 'green'  ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                color === 'blue'   ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                color === 'purple' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' :
                color === 'cyan'   ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' :
                                     'bg-orange-500/10 border-orange-500/20 text-orange-400'}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </div>
          ))}
        </div>
      </div>

      {}
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Feature Systems</h2>
        <p className="text-slate-500 text-sm mb-6">Seventeen integrated systems covering the full lifecycle of NFT creation, DeFi operations, and tooling on Cronos and Solana.</p>
        <div className="space-y-2">
          {FEATURE_SYSTEMS.map((sys, i) => {
            const Icon = sys.icon;
            const isOpen = openSystem === i;
            const COLOR_MAP: Record<string, string> = {
              blue:   'text-blue-400 bg-blue-500/15',
              cyan:   'text-cyan-400 bg-cyan-500/15',
              green:  'text-green-400 bg-green-500/15',
              yellow: 'text-yellow-400 bg-yellow-500/15',
              purple: 'text-purple-400 bg-purple-500/15',
              orange: 'text-orange-400 bg-orange-500/15',
              violet: 'text-violet-400 bg-violet-500/15',
              indigo: 'text-indigo-400 bg-indigo-500/15',
            };
            const [textColor, bgColor] = COLOR_MAP[sys.color].split(' ');
            return (
              <div key={i} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <button onClick={() => setOpenSystem(isOpen ? null : i)}
                  className="w-full flex items-center gap-4 p-5 hover:bg-slate-800/30 transition-colors text-left">
                  <div className={`p-2.5 rounded-xl ${bgColor} flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${textColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className={`text-[10px] font-bold uppercase tracking-widest ${textColor}`}>System {sys.num}</p>
                      <code className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded font-mono">{sys.subtitle}</code>
                    </div>
                    <p className="text-white font-bold text-sm mt-0.5">{sys.title}</p>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />}
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 border-t border-slate-800">
                    <p className="text-slate-400 text-sm leading-relaxed mt-4 mb-4">{sys.description}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {sys.features.map((f) => (
                        <div key={f} className="flex items-start gap-2 text-xs text-slate-300">
                          <CheckCircle className={`w-3.5 h-3.5 ${textColor} flex-shrink-0 mt-0.5`} />
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {}
      <div>
        <h2 className="text-2xl font-bold text-white mb-6">Technology Stack</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Frontend', items: ['React 19', 'TypeScript', 'Tailwind CSS v4', 'ethers.js v6', 'wagmi + viem', 'Recharts'], color: 'blue' },
            { label: 'Backend',  items: ['Node.js + Express', 'TypeScript + tsx', 'solc (Solidity compiler)', 'Prisma ORM', 'Redis', 'JWT + bcrypt'], color: 'green' },
            { label: 'EVM (Cronos)', items: ['Cronos Mainnet (25)', 'Cronos Testnet (338)', 'ERC-721, 721A, 1155', 'VVS Finance V2 DEX', 'OpenZeppelin v5', 'EIP-2981, EIP-2612'], color: 'purple' },
            { label: 'Solana', items: ['Solana Mainnet-Beta', 'Solana Devnet', 'SPL Token, Metaplex NFT', 'Jupiter V6 Aggregator', 'Raydium AMM + CLMM', 'Candy Machine v3'], color: 'orange' },
            { label: 'Storage & Infra', items: ['Lighthouse Storage', 'Pinata IPFS', 'Infura IPFS', 'PostgreSQL', 'Docker Compose', 'GitHub Actions CI'], color: 'orange' },
          ].map(({ label, items, color }) => (
            <div key={label} className="bg-slate-900 rounded-xl border border-slate-800 p-5">
              <p className={`text-xs font-bold uppercase tracking-widest mb-4 ${
                color === 'blue' ? 'text-blue-400' : color === 'green' ? 'text-green-400' : color === 'purple' ? 'text-purple-400' : 'text-orange-400'
              }`}>{label}</p>
              <ul className="space-y-1.5">
                {items.map((item) => (
                  <li key={item} className="text-slate-300 text-xs flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      color === 'blue' ? 'bg-blue-500' : color === 'green' ? 'bg-green-500' : color === 'purple' ? 'bg-purple-500' : 'bg-orange-500'
                    }`} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {}
      <div>
        <h2 className="text-2xl font-bold text-white mb-6">FAQ</h2>
        <div className="space-y-2">
          {FAQ.map((item, i) => (
            <div key={i} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between p-5 hover:bg-slate-800/30 transition-colors text-left">
                <span className="text-white font-semibold text-sm pr-4">{item.q}</span>
                {openFaq === i ? <ChevronUp className="w-4 h-4 text-slate-500 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />}
              </button>
              {openFaq === i && (
                <div className="px-5 pb-5 border-t border-slate-800">
                  <p className="text-slate-400 text-sm leading-relaxed mt-4">{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {}
      <div className="border-t border-slate-800 pt-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-slate-600 text-xs uppercase tracking-widest font-semibold mb-1">Built by</p>
            <p className="text-2xl font-black text-white tracking-tight">XTAMATA</p>
            <p className="text-slate-500 text-xs mt-1">Crolana — NFT + DeFi Launchpad</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {}
            <a href="https://discord.gg/WUxR2w8zM7" target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold transition-all">
              <DiscordIcon /> Discord
            </a>
            <a href="https://x.com/CronosDevStudio" target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg text-xs font-semibold transition-all">
              <XIcon /> @CronosDevStudio
            </a>
            {}
            <a href="https://cronos.org" target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors">
              <Globe className="w-3.5 h-3.5" /> Cronos
            </a>
            <a href="https://explorer.cronos.org" target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors">
              <ExternalLink className="w-3.5 h-3.5" /> Cronoscan
            </a>
            <a href="https://vvs.finance" target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors">
              <Droplets className="w-3.5 h-3.5" /> VVS Finance
            </a>
            <a href="https://phantom.app" target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors">
              <span className="text-xs">👻</span> Phantom
            </a>
            <a href="https://jup.ag" target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors">
              <ArrowLeftRight className="w-3.5 h-3.5" /> Jupiter
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
export default About;
