

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  X, ExternalLink, Smartphone, AlertTriangle,
  Loader2, ChevronRight, Zap, RefreshCw,
  CheckCircle2, Copy, Shield,
} from 'lucide-react';
import { useAppStore } from '../store';
import { isSolanaNetwork } from '../types';
import { connectPhantom, isPhantomInstalled } from '../lib/solana';
import { cn } from '../lib/utils';
import { parseChainError } from '../lib/chainErrors';
import { isWalletConnectEnabled, openWalletConnect } from '../lib/walletconnect';



const EVM_WALLETS = [
  {
    id: 'metamask',
    name: 'MetaMask',
    icon: '🦊',
    description: 'Most popular EVM wallet · 30M+ users',
    detect: () => !!((window as any).ethereum?.isMetaMask && !(window as any).ethereum?.isCryptoCom),
    downloadUrl: 'https://metamask.io/download/',
    deepLink: (url: string) => `https://metamask.app.link/dapp/${url}`,
    color: '#F6851B',
  },
  {
    id: 'cryptocom',
    name: 'Crypto.com DeFi Wallet',
    icon: '🔵',
    description: 'Official Cronos wallet · Best for CRO',
    detect: () => !!((window as any).ethereum?.isCryptoCom || (window as any).ethereum?.isCDCWallet),
    downloadUrl: 'https://crypto.com/defi-wallet',
    deepLink: null,
    color: '#1199FA',
  },
  {
    id: 'coinbase',
    name: 'Coinbase Wallet',
    icon: '🔷',
    description: 'Easy self-custody · EVM + L2 support',
    detect: () => !!((window as any).ethereum?.isCoinbaseWallet || (window as any).ethereum?.isCoinbaseBrowser),
    downloadUrl: 'https://www.coinbase.com/wallet',
    deepLink: (url: string) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
    color: '#0052FF',
  },
  {
    id: 'trust',
    name: 'Trust Wallet',
    icon: '🛡️',
    description: 'Multi-chain · 80M+ users worldwide',
    detect: () => !!((window as any).ethereum?.isTrust || (window as any).trustwallet),
    downloadUrl: 'https://trustwallet.com/',
    deepLink: (url: string) => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}`,
    color: '#3375BB',
  },
];

const SOL_WALLETS = [
  {
    id: 'phantom',
    name: 'Phantom',
    icon: '👻',
    description: 'Leading Solana wallet · NFTs, DeFi, dApps',
    detect: () => isPhantomInstalled() && !(window as any).solana?.isMetaMask,
    downloadUrl: 'https://phantom.app/',
    deepLink: (url: string) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(url)}`,
    color: '#AB9FF2',
    connectFn: 'phantom',
  },
  {
    id: 'metamask-solana',
    name: 'MetaMask (Solana)',
    icon: '🦊',
    description: 'MetaMask with Solana support enabled',
    detect: () => {
      const w = window as any;
      
      if (w.solana?.isMetaMask) return true;
      
      if (w.phantom?.ethereum?.isMetaMask) return true;
      
      if (Array.isArray(w.ethereum?.providers)) {
        return w.ethereum.providers.some((p: any) => p.isMetaMask);
      }
      return false;
    },
    downloadUrl: 'https://metamask.io/download/',
    deepLink: null,
    color: '#F6851B',
    connectFn: 'metamask-solana',
  },
  {
    id: 'solflare',
    name: 'Solflare',
    icon: '🔥',
    description: 'Native Solana wallet · Staking + DeFi',
    detect: () => !!(window as any).solflare?.isSolflare,
    downloadUrl: 'https://solflare.com/',
    deepLink: (url: string) => `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(url)}`,
    color: '#FC8D08',
    connectFn: 'solflare',
  },
  {
    id: 'backpack',
    name: 'Backpack',
    icon: '🎒',
    description: 'Multi-chain wallet by Coral · xNFTs',
    detect: () => !!(window as any).backpack?.isBackpack,
    downloadUrl: 'https://www.backpack.app/',
    deepLink: null,
    color: '#E33E3F',
    connectFn: 'backpack',
  },
];





function generateQRSVG(text: string, size = 200): string {
  
  
  const qrData = encodeQR(text);
  if (!qrData) return '';

  const modules = qrData.length;
  const cellSize = Math.floor(size / modules);
  const offset = Math.floor((size - modules * cellSize) / 2);

  let rects = '';
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (qrData[r][c]) {
        rects += `<rect x="${offset + c * cellSize}" y="${offset + r * cellSize}" width="${cellSize}" height="${cellSize}" fill="black"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="white"/>
    ${rects}
  </svg>`;
}


function encodeQR(text: string): boolean[][] | null {
  try {
    const bytes = Array.from(text).map(c => c.charCodeAt(0));
    const len = bytes.length;

    
    
    let version = 1;
    const maxBytes = [14, 26, 42, 62, 86];
    for (let v = 0; v < maxBytes.length; v++) {
      if (len <= maxBytes[v]) { version = v + 1; break; }
    }
    if (len > maxBytes[maxBytes.length - 1]) return null; 

    const size = 17 + version * 4;
    const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));

    
    const addFinder = (row: number, col: number) => {
      const pat = [
        [1,1,1,1,1,1,1],[1,0,0,0,0,0,1],[1,0,1,1,1,0,1],
        [1,0,1,1,1,0,1],[1,0,1,1,1,0,1],[1,0,0,0,0,0,1],[1,1,1,1,1,1,1]
      ];
      for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
        if (row+r < size && col+c < size) matrix[row+r][col+c] = !!pat[r][c];
      }
    };
    addFinder(0, 0); addFinder(0, size - 7); addFinder(size - 7, 0);

    
    for (let i = 0; i < 8; i++) {
      const s = size - 8;
      if (i < size) {
        [matrix[7][i], matrix[i][7], matrix[7][s+i], matrix[i][size-8]] = [false,false,false,false];
        [matrix[s+i][7], matrix[size-8][i]] = [false,false];
      }
    }

    
    for (let i = 8; i < size - 8; i++) {
      matrix[6][i] = matrix[i][6] = (i % 2 === 0);
    }

    
    matrix[size - 8][8] = true;

    
    const formatBits = [true,false,true,false,true,false,false,false,false,false,true,false,false,true,false];
    const fmtPositions = [[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[7,8],[8,8],[8,7],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0]];
    fmtPositions.forEach(([r,c], i) => { matrix[r][c] = formatBits[i]; });
    
    for (let i = 0; i < 7; i++) matrix[size-1-i][8] = formatBits[i];
    for (let i = 0; i < 8; i++) matrix[8][size-8+i] = formatBits[14-i];

    
    const dataBits: boolean[] = [];
    const push = (val: number, bits: number) => {
      for (let b = bits - 1; b >= 0; b--) dataBits.push(!!(val >> b & 1));
    };
    push(0b0100, 4);         
    push(len, 8);             
    bytes.forEach(b => push(b, 8));
    push(0, 4);               

    
    while (dataBits.length % 8 !== 0) dataBits.push(false);
    const padBytes = [0xEC, 0x11];
    let pi = 0;
    while (dataBits.length < (version <= 1 ? 128 : version <= 2 ? 224 : 352)) {
      push(padBytes[pi++ % 2], 8);
    }

    
    let bitIdx = 0;
    let upward = true;
    for (let col = size - 1; col >= 1; col -= 2) {
      if (col === 6) col--;
      const cols = [col, col - 1];
      for (let row = 0; row < size; row++) {
        const r = upward ? size - 1 - row : row;
        for (const c of cols) {
          if (matrix[r][c] === null && bitIdx < dataBits.length) {
            const bit = dataBits[bitIdx++];
            
            matrix[r][c] = (r + c) % 2 === 0 ? !bit : bit;
          } else if (matrix[r][c] === null) {
            matrix[r][c] = (r + c) % 2 === 0;
          }
        }
      }
      upward = !upward;
    }

    return matrix.map(row => row.map(cell => cell === null ? false : !!cell));
  } catch {
    return null;
  }
}



type Tab = 'evm' | 'solana';
type View = 'wallets' | 'qr';

interface QRState { url: string; walletName: string; deepLink: string | null; }



export function WalletModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { network, setWalletAddress, setSolanaWalletAddress, addNotification } = useAppStore();

  const defaultTab: Tab = isSolanaNetwork(network) ? 'solana' : 'evm';
  const [tab, setTab]           = useState<Tab>(defaultTab);
  const [view, setView]         = useState<View>('wallets');
  
  
  const isMobile = typeof navigator !== 'undefined' &&
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  
  
  const WC_ENABLED = isWalletConnectEnabled();
  const [wcPending, setWcPending] = useState(false);
  const [connecting, setConn]   = useState<string | null>(null);
  const [evmDet, setEvmDet]     = useState<Set<string>>(new Set());
  const [solDet, setSolDet]     = useState<Set<string>>(new Set());
  const [qrState, setQrState]   = useState<QRState | null>(null);
  const [copied, setCopied]     = useState(false);
  const svgRef = useRef<HTMLDivElement>(null);

  const siteUrl = typeof window !== 'undefined'
    ? window.location.href.replace(/\/$/, '')
    : 'http://localhost:3000';

  
  useEffect(() => {
    if (!isOpen) { setView('wallets'); setQrState(null); return; }
    setTab(isSolanaNetwork(network) ? 'solana' : 'evm');
    const e = new Set<string>();
    EVM_WALLETS.forEach(w => { try { if (w.detect()) e.add(w.id); } catch {} });
    setEvmDet(e);
    const s = new Set<string>();
    SOL_WALLETS.forEach(w => { try { if (w.detect()) s.add(w.id); } catch {} });
    setSolDet(s);
  }, [isOpen, network]);

  

  const connectEvm = async (wallet: typeof EVM_WALLETS[0]) => {
    if (!wallet.detect()) {
      if (wallet.deepLink) {
        const deepLink = wallet.deepLink(siteUrl);
        if (isMobile) {
          
          window.location.href = deepLink;
        } else {
          
          setQrState({ url: deepLink, walletName: wallet.name, deepLink });
          setView('qr');
        }
      } else {
        window.open(wallet.downloadUrl, '_blank');
      }
      return;
    }
    setConn(wallet.id);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      if (!accounts?.length) throw new Error('No accounts returned');
      setWalletAddress(accounts[0]);
      try {
        await (window as any).ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${network.chainId.toString(16)}` }] });
      } catch (e: any) {
        if (e.code === 4902 || e.code === -32603) {
          await (window as any).ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${network.chainId.toString(16)}`,
              chainName: network.name,
              rpcUrls: [network.rpcUrl],
              nativeCurrency: { name: 'Cronos', symbol: network.symbol, decimals: 18 },
              blockExplorerUrls: [network.explorerUrl],
            }],
          });
        }
      }
      addNotification({ type: 'success', title: `${wallet.name} Connected`, message: `${accounts[0].slice(0,6)}…${accounts[0].slice(-4)}`, duration: 4000 });
      onClose();
    } catch (err: any) {
      const parsed = parseChainError(err, 'cronos');
      if (!parsed.code.includes('USER_REJECTED')) {
        addNotification({ type: 'error', title: parsed.title, message: parsed.suggestion ?? parsed.message, duration: 5000 });
      }
    } finally { setConn(null); }
  };

  

  const connectSolana = async (wallet: typeof SOL_WALLETS[0]) => {
    if (!wallet.detect()) {
      if (wallet.deepLink) {
        const deepLink = wallet.deepLink(siteUrl);
        if (isMobile) {
          
          window.location.href = deepLink;
        } else {
          
          setQrState({ url: deepLink, walletName: wallet.name, deepLink });
          setView('qr');
        }
      } else {
        window.open(wallet.downloadUrl, '_blank');
      }
      return;
    }
    setConn(wallet.id);
    try {
      let address: string;

      if (wallet.connectFn === 'phantom') {
        
        address = await connectPhantom();
        setSolanaWalletAddress(address);

      } else if (wallet.connectFn === 'metamask-solana') {
        
        const w = window as any;
        const mmSolana = w.solana?.isMetaMask ? w.solana : w.phantom?.ethereum?.isMetaMask ? w.solana : null;
        if (!mmSolana) throw new Error('MetaMask Solana not available. Enable Solana in MetaMask Settings → Experimental.');
        const resp = await mmSolana.connect();
        address = resp.publicKey?.toBase58 ? resp.publicKey.toBase58() : resp.publicKey.toString();
        setSolanaWalletAddress(address);

      } else if (wallet.connectFn === 'solflare') {
        const solflare = (window as any).solflare;
        if (!solflare?.isSolflare) throw new Error('Solflare not installed');
        await solflare.connect();
        address = solflare.publicKey?.toBase58();
        if (!address) throw new Error('Solflare: no public key');
        setSolanaWalletAddress(address);

      } else if (wallet.connectFn === 'backpack') {
        const backpack = (window as any).backpack;
        if (!backpack?.isBackpack) throw new Error('Backpack not installed');
        await backpack.connect();
        address = backpack.publicKey?.toBase58 ? backpack.publicKey.toBase58() : backpack.publicKey.toString();
        setSolanaWalletAddress(address);

      } else {
        throw new Error(`Unknown wallet: ${wallet.id}`);
      }

      addNotification({ type: 'success', title: `${wallet.name} Connected`, message: `${address.slice(0,6)}…${address.slice(-4)} on ${network.name}`, duration: 4000 });
      onClose();
    } catch (err: any) {
      const parsed = parseChainError(err, 'solana');
      if (!parsed.code.includes('USER_REJECTED')) {
        addNotification({ type: 'error', title: parsed.title, message: parsed.suggestion ?? parsed.message, duration: 6000 });
      }
    } finally { setConn(null); }
  };

  

  const copyUrl = useCallback(async () => {
    if (!qrState) return;
    await navigator.clipboard.writeText(qrState.deepLink ?? qrState.url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [qrState]);

  

  if (!isOpen) return null;

  const wallets  = tab === 'evm' ? EVM_WALLETS : SOL_WALLETS;
  const detected = tab === 'evm' ? evmDet : solDet;
  const installed    = wallets.filter(w => detected.has(w.id));
  const notInstalled = wallets.filter(w => !detected.has(w.id));
  const onConnect    = tab === 'evm'
    ? (w: any) => connectEvm(w)
    : (w: any) => connectSolana(w);
  const accentCls = tab === 'solana' ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white';

  

  if (view === 'qr' && qrState) {
    const svgMarkup = generateQRSVG(qrState.deepLink ?? qrState.url, 220);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
          {}
          <div className="flex items-center gap-3 p-5 border-b border-slate-800">
            <button
              onClick={() => setView('wallets')}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white">Scan to Connect</h2>
              <p className="text-xs text-slate-400 mt-0.5">Open <span className="text-slate-300">{qrState.walletName} Mobile</span> and scan</p>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {}
          <div className="flex flex-col items-center gap-4 p-6">
            <div className="p-3 bg-white rounded-2xl shadow-lg">
              {svgMarkup
                ? <div dangerouslySetInnerHTML={{ __html: svgMarkup }} />
                : (
                  <div className="w-[220px] h-[220px] flex items-center justify-center bg-slate-100 rounded-xl">
                    <p className="text-xs text-slate-500 text-center px-4">URL too long for QR.<br/>Use the copy link below.</p>
                  </div>
                )
              }
            </div>

            <div className="w-full space-y-2.5">
              <p className="text-xs text-slate-400 text-center">
                Opens <span className="text-slate-300 font-medium">{qrState.walletName}</span> browser pointing to this dApp
              </p>

              {}
              <a
                href={qrState.deepLink ?? qrState.url}
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm font-medium text-white transition-colors"
              >
                <Smartphone className="w-4 h-4 text-slate-400" />
                Open in {qrState.walletName} App
              </a>

              {}
              <button
                onClick={copyUrl}
                className="flex items-center justify-center gap-2 w-full py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                {copied
                  ? <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /><span className="text-green-400">Copied!</span></>
                  : <><Copy className="w-3.5 h-3.5" /><span>Copy link</span></>
                }
              </button>
            </div>

            {}
            <div className="w-full p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
              <p className="text-[11px] text-slate-500 leading-relaxed">
                <span className="text-slate-400 font-medium">How it works: </span>
                1. Open your wallet app → 2. Tap the browser/scan icon → 3. Navigate here or scan the QR above.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">

        {}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-white">Connect Wallet</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Connecting to <span className="text-slate-300 font-medium">{network.name}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {}
        {isSolanaNetwork(network) && (
          <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
            <Zap className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
            <p className="text-xs text-purple-300">
              Solana network — use a Solana wallet (Phantom, MetaMask Solana, or Solflare)
            </p>
          </div>
        )}

        {}
        <div className="flex gap-1 p-4 pb-2">
          {(['evm', 'solana'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 py-2 text-xs font-bold rounded-lg uppercase tracking-wider transition-all',
                tab === t ? accentCls : 'bg-slate-800 text-slate-400 hover:text-white',
              )}
            >
              {t === 'evm' ? '⛓ EVM / Cronos' : '◎ Solana'}
            </button>
          ))}
        </div>

        {}
        <div className="p-4 space-y-2 max-h-[55vh] overflow-y-auto">

          {}
          {tab === 'solana' && (
            <div className="flex items-start gap-2.5 p-2.5 bg-orange-500/8 border border-orange-500/15 rounded-xl mb-2">
              <span className="text-sm flex-shrink-0 mt-0.5">🦊</span>
              <p className="text-[11px] text-orange-200/70 leading-relaxed">
                <span className="font-semibold text-orange-300/90">MetaMask Solana:</span> Go to MetaMask → Settings → Experimental → Enable Solana, then reload this page.
              </p>
            </div>
          )}

          {}
          {installed.length === 0 && (
            <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <Smartphone className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-300/80">
                {isMobile
                  ? (tab === 'solana'
                    ? 'Tap "Phantom" or "Solflare" below to open in your wallet app, or install one first.'
                    : 'Tap "MetaMask" below to open in your wallet app, or install MetaMask Mobile.')
                  : (tab === 'solana'
                    ? 'No Solana wallet detected. Install Phantom or enable Solana in MetaMask settings.'
                    : 'No EVM wallet detected. Install MetaMask or Crypto.com DeFi Wallet.')}
              </p>
            </div>
          )}

          {}
          {installed.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 px-1">
                Detected ({installed.length})
              </p>
              <div className="space-y-1.5">
                {installed.map(w => (
                  <button
                    key={w.id}
                    onClick={() => onConnect(w)}
                    disabled={!!connecting}
                    className={cn(
                      'w-full flex items-center gap-3.5 p-3.5 bg-slate-800 hover:bg-slate-750',
                      'border border-slate-700 rounded-xl transition-all group text-left',
                      tab === 'solana' ? 'hover:border-purple-500/40' : 'hover:border-blue-500/40',
                    )}
                  >
                    <span className="text-2xl w-8 text-center flex-shrink-0">{w.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white text-sm">{w.name}</p>
                      <p className="text-xs text-slate-400 truncate">{w.description}</p>
                    </div>
                    {connecting === w.id
                      ? <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors flex-shrink-0" />
                    }
                  </button>
                ))}
              </div>
            </div>
          )}

          {}
          {notInstalled.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5 px-1">
                {isMobile ? 'Open in Wallet App' : 'Get a Wallet'}
              </p>
              <div className="space-y-1.5">
                {notInstalled.map(w => {
                  const hasDeepLink = !!(w as any).deepLink;
                  return (
                    <button
                      key={w.id}
                      onClick={() => onConnect(w)}
                      className="w-full flex items-center gap-3.5 p-3 bg-slate-950/40 border border-slate-800 hover:border-slate-600 rounded-xl transition-all group text-left opacity-60 hover:opacity-100"
                    >
                      <span className="text-xl w-8 text-center flex-shrink-0 grayscale group-hover:grayscale-0 transition-all">{w.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-300 text-sm">{w.name}</p>
                        <p className="text-xs text-slate-500 truncate">{w.description}</p>
                      </div>
                      {hasDeepLink
                        ? <Smartphone className="w-3.5 h-3.5 text-slate-600 group-hover:text-blue-400 flex-shrink-0" />
                        : <ExternalLink className="w-3.5 h-3.5 text-slate-600 group-hover:text-blue-400 flex-shrink-0" />
                      }
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {}
          <div
            className="flex items-center gap-3 p-3 bg-slate-950/50 border border-slate-800 hover:border-slate-600 rounded-xl cursor-pointer transition-all group"
            onClick={() => {
              
              setQrState({ url: siteUrl, walletName: 'Mobile Wallet', deepLink: null });
              setView('qr');
            }}
          >
            <div className="p-1.5 bg-slate-800 rounded-lg group-hover:bg-slate-700 transition-colors">
              <Smartphone className="w-4 h-4 text-slate-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-slate-400 group-hover:text-slate-300">Use Mobile Wallet</p>
              <p className="text-[11px] text-slate-600">Scan QR or tap to open in wallet app</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 flex-shrink-0" />
          </div>

          {}
          {WC_ENABLED && (
            <button
              onClick={async () => {
                setWcPending(true);
                try {
                  await openWalletConnect(tab === 'solana' ? 'solana' : 'eip155');
                  onClose(); 
                } catch (e: any) {
                  addNotification({ type: 'error', title: 'WalletConnect failed',
                    message: e.message ?? 'Could not open WalletConnect modal', duration: 5000 });
                } finally { setWcPending(false); }
              }}
              disabled={wcPending}
              className="w-full flex items-center gap-3 p-3 bg-slate-950/50 border border-slate-700 hover:border-blue-500/40 rounded-xl transition-all group"
            >
              <div className="p-1.5 bg-slate-800 rounded-lg group-hover:bg-blue-600/20 transition-colors flex-shrink-0">
                {wcPending
                  ? <span className="w-4 h-4 block border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                  : <svg className="w-4 h-4 text-blue-400" viewBox="0 0 40 25" fill="currentColor">
                      <path d="M8.19 0C13.3 0 17.56 4.08 18.4 9.42 19.25 4.08 23.5 0 28.62 0 34.33 0 39 4.56 39 10.18 39 20.5 24.74 25 20 25 15.26 25 1 20.5 1 10.18 1 4.56 5.67 0 11.38 0Z" />
                    </svg>
                }
              </div>
              <div className="flex-1 text-left">
                <p className="text-xs font-semibold text-slate-300 group-hover:text-white">WalletConnect</p>
                <p className="text-[11px] text-slate-500">Connect any WalletConnect-compatible wallet</p>
              </div>
            </button>
          )}

          {}
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Shield className="w-3 h-3 text-slate-600 flex-shrink-0" />
            <p className="text-[10px] text-slate-600">
              Crolana never stores private keys or seed phrases.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
export default WalletModal;
