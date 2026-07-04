

import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { getSolBalance, formatSol } from '../lib/solana';
import {
  Wallet, ChevronDown, Network, LogOut, Copy, ExternalLink,
  CheckCircle, RefreshCw, Loader2, Zap, Menu, Activity, ArrowLeftRight,
  Droplets, Minus, Code,
} from 'lucide-react';
import { useAppStore } from '../store';
import { CRONOS_MAINNET, CRONOS_TESTNET, SOLANA_MAINNET, SOLANA_DEVNET, isSolanaNetwork } from '../types';
import { cn } from '../lib/utils';
import { useUnifiedWallet } from '../hooks/useUnifiedWallet';

// Lazy load heavy wallet components
const WalletMenu = lazy(() => import('./WalletMenu'));
const WalletModal = lazy(() => import('./WalletModal'));

const ALL_NETWORKS = [CRONOS_MAINNET, CRONOS_TESTNET, SOLANA_MAINNET, SOLANA_DEVNET];

export function Header() {
  const {
    walletAddress, setWalletAddress,
    solanaWalletAddress, setSolanaWalletAddress,
    network, setNetwork, addNotification,
  } = useAppStore();

  
  
  const unified = useUnifiedWallet();

  
  useEffect(() => {
    const evmAddr = unified.evmWallet?.address ?? null;
    if (evmAddr !== walletAddress) setWalletAddress(evmAddr);
  }, [unified.evmWallet?.address]);

  useEffect(() => {
    const solAddr = unified.solanaWallet?.address ?? null;
    if (solAddr !== solanaWalletAddress) setSolanaWalletAddress(solAddr);
  }, [unified.solanaWallet?.address]);

  const isSolana = isSolanaNetwork(network);
  const activeWallet = isSolana ? solanaWalletAddress : walletAddress;

  const [isNetworkOpen, setIsNetworkOpen]   = useState(false);
  const [isWalletMenuOpen, setIsWalletMenuOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [nativeBalance, setNativeBalance]   = useState<string | null>(null);

  const networkMenuRef = useRef<HTMLDivElement>(null);

  
  useEffect(() => {
    let cancelled = false;
    setNativeBalance(null);

    const fetchBalance = async (retries = 3) => {
      if (!activeWallet) return;

      if (isSolana) {
        for (let attempt = 0; attempt < retries; attempt++) {
          try {
            const lamports = await getSolBalance(activeWallet, network.cluster ?? 'mainnet-beta');
            if (!cancelled) setNativeBalance(formatSol(lamports, 3));
            return;
          } catch {
            if (attempt < retries - 1) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          }
        }
      } else {
        // Dynamically import provider and ethers to reduce initial bundle size
        const { getReadProvider } = await import('../lib/provider');
        const { ethers } = await import('ethers');
        for (let attempt = 0; attempt < retries; attempt++) {
          try {
            const provider = getReadProvider(network.chainId);
            const bal = await provider.getBalance(activeWallet);
            if (!cancelled) setNativeBalance(parseFloat(ethers.formatEther(bal)).toFixed(3));
            return;
          } catch (err) {
            console.error('Balance fetch error (attempt', attempt, '):', err);
            if (attempt < retries - 1) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          }
        }
      }
    };

    fetchBalance();
    const interval = activeWallet ? setInterval(() => fetchBalance(2), isSolana ? 20_000 : 15_000) : null;
    return () => { cancelled = true; if (interval) clearInterval(interval); };
  }, [activeWallet, network, isSolana]);

  
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (networkMenuRef.current && !networkMenuRef.current.contains(e.target as Node)) setIsNetworkOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  

  
  useEffect(() => {
    if (!(window as any).ethereum) return;
    const onAcc = (acc: string[]) => { setWalletAddress(acc[0] || ''); setNativeBalance(null); };
    const onChain = () => window.location.reload();
    (window as any).ethereum.on('accountsChanged', onAcc);
    (window as any).ethereum.on('chainChanged', onChain);
    return () => { (window as any).ethereum.removeListener('accountsChanged', onAcc); (window as any).ethereum.removeListener('chainChanged', onChain); };
  }, []);

  
  useEffect(() => {
    if (!window.solana) return;
    const onDisconnect = () => { setSolanaWalletAddress(null); setNativeBalance(null); };
    const onConnect = (pubkey: any) => { if (pubkey) setSolanaWalletAddress(pubkey.toString()); };
    window.solana.on('disconnect', onDisconnect);
    window.solana.on('connect', onConnect);
    return () => { try { window.solana!.off('disconnect', onDisconnect); window.solana!.off('connect', onConnect); } catch {} };
  }, []);



  const shortAddr = activeWallet ? `${activeWallet.slice(0, 6)}…${activeWallet.slice(-4)}` : '';

  const netColor = (net: typeof CRONOS_MAINNET) => {
    if (isSolanaNetwork(net)) return net.isTestnet ? 'bg-orange-500' : 'bg-purple-500';
    return net.isTestnet ? 'bg-yellow-500' : 'bg-green-500';
  };
  const activeDot = netColor(network);

  const switchNetwork = async (target: typeof CRONOS_MAINNET) => {
    setNetwork(target);
    setIsNetworkOpen(false);
    setNativeBalance(null);
    if (!isSolanaNetwork(target) && walletAddress && (window as any).ethereum) {
      try {
        await (window as any).ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${target.chainId.toString(16)}` }] });
      } catch (err: any) {
        if (err.code === 4902 || err.code === -32603) {
          await (window as any).ethereum.request({ method: 'wallet_addEthereumChain', params: [{
            chainId: `0x${target.chainId.toString(16)}`,
            chainName: target.name, rpcUrls: [target.rpcUrl],
            nativeCurrency: { name: target.symbol, symbol: target.symbol, decimals: 18 },
            blockExplorerUrls: [target.explorerUrl],
          }]});
        }
      }
    }
  };



  return (
    <>
      <header
        className="h-16 bg-slate-900/95 backdrop-blur border-b border-slate-800 flex items-center justify-between px-3 sm:px-6 fixed top-0 right-0 z-50"
        style={{ left: 'var(--sidebar-width, 16rem)', transition: 'left 0.3s' }}
      >
        <div className="flex items-center gap-3">
          {}
          <button
            className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            onClick={() => {
              
              window.dispatchEvent(new CustomEvent('toggle-sidebar'));
            }}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className={`w-2 h-2 rounded-full ${activeDot}`} />
          <span className="text-slate-300 text-sm font-medium">{network.name}</span>
          {isSolana
            ? <span className="text-slate-600 text-xs">{network.cluster}</span>
            : <span className="text-slate-600 text-xs">ID: {network.chainId}</span>}
          {isSolana && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-500/15 border border-purple-500/25 text-purple-400 text-[9px] font-bold rounded uppercase tracking-wider">
              <Zap className="w-2.5 h-2.5" /> Solana
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">

          {}
          <div className="relative" ref={networkMenuRef}>
            <button
              onClick={() => setIsNetworkOpen(!isNetworkOpen)}
              aria-label="Select network"
              aria-expanded={isNetworkOpen}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors text-sm font-medium border border-slate-700"
            >
              <div className={`w-2 h-2 rounded-full ${activeDot}`} />
              <Network className="w-3.5 h-3.5" />
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isNetworkOpen ? 'rotate-180' : ''}`} />
            </button>
            {isNetworkOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-800 rounded-xl shadow-2xl border border-slate-700 py-1.5 z-50">
                <p className="text-[10px] text-slate-500 uppercase font-semibold px-3 py-1.5">Cronos (EVM)</p>
                {[CRONOS_MAINNET, CRONOS_TESTNET].map(net => (
                  <button key={net.chainId} onClick={() => switchNetwork(net)}
                    className={cn('w-full text-left px-3 py-2.5 text-sm hover:bg-slate-700 transition-colors flex items-center gap-3',
                      network.chainId === net.chainId && !isSolana ? 'text-white' : 'text-slate-400')}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${net.isTestnet ? 'bg-yellow-500' : 'bg-green-500'}`} />
                    <div className="flex-1">
                      <p className="font-medium">{net.name}</p>
                      <p className="text-[10px] text-slate-500">Chain ID: {net.chainId}</p>
                    </div>
                    {network.chainId === net.chainId && !isSolana && <CheckCircle className="w-3.5 h-3.5 text-blue-400 ml-auto" />}
                  </button>
                ))}
                <div className="border-t border-slate-700/60 mt-1 pt-1">
                  <p className="text-[10px] text-purple-400/70 uppercase font-semibold px-3 py-1.5">Solana</p>
                  {[SOLANA_MAINNET, SOLANA_DEVNET].map(net => (
                    <button key={net.cluster} onClick={() => switchNetwork(net)}
                      className={cn('w-full text-left px-3 py-2.5 text-sm hover:bg-slate-700 transition-colors flex items-center gap-3',
                        isSolana && network.cluster === net.cluster ? 'text-white' : 'text-slate-400')}>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${net.isTestnet ? 'bg-orange-500' : 'bg-purple-500'}`} />
                      <div className="flex-1">
                        <p className="font-medium">{net.name}</p>
                        <p className="text-[10px] text-slate-500">{net.cluster}</p>
                      </div>
                      {isSolana && network.cluster === net.cluster && <CheckCircle className="w-3.5 h-3.5 text-purple-400 ml-auto" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {}
          {activeWallet ? (
            <div className="relative">
              <button onClick={() => setIsWalletMenuOpen(!isWalletMenuOpen)}
                className={cn('flex items-center gap-2.5 px-4 py-2 rounded-lg text-sm font-medium transition-all border',
                  isSolana
                    ? 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border-purple-500/30'
                    : 'bg-green-500/10 hover:bg-green-500/20 text-green-400 border-green-500/30')}>
                <div className={cn('w-2 h-2 rounded-full animate-pulse', isSolana ? 'bg-purple-400' : 'bg-green-400')} />
                <span className="font-mono">{shortAddr}</span>
                {nativeBalance ? (
                  <span className={cn('text-xs border-l pl-2', isSolana ? 'text-purple-300/70 border-purple-500/20' : 'text-green-300/70 border-green-500/20')}>
                    {nativeBalance} {network.symbol}
                  </span>
                ) : (
                  <span className={cn('text-xs border-l pl-2 animate-pulse', isSolana ? 'text-purple-300/30 border-purple-500/20' : 'text-green-300/30 border-green-500/20')}>
                    … {network.symbol}
                  </span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isWalletMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isWalletMenuOpen && (
                <React.Suspense fallback={null}>
                  <WalletMenu isOpen={isWalletMenuOpen} onClose={() => setIsWalletMenuOpen(false)} nativeBalance={nativeBalance} />
                </React.Suspense>
              )}
            </div>
          ) : (
            <button onClick={() => setIsWalletModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-colors shadow-lg shadow-blue-900/30">
              <Wallet className="w-4 h-4" /> Connect Wallet
            </button>
          )}
        </div>
      </header>
      {isWalletModalOpen && (
        <React.Suspense fallback={null}>
          <WalletModal isOpen={isWalletModalOpen} onClose={() => setIsWalletModalOpen(false)} />
        </React.Suspense>
      )}
    </>
  );
}
