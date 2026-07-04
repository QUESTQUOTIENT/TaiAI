import React, { useEffect, useState, useRef } from 'react';
import { useAppStore } from '../store';
import { isSolanaNetwork } from '../types';
import { cn } from '../lib/utils';
import { parseChainError } from '../lib/chainErrors';
import { getTransactions } from '../services/api/transactionApiService';
import { useWalletTokens } from '../hooks/useWalletTokens';
import { useSolanaTokens } from '../hooks/useSolanaTokens';
import { getTokenList } from '../data/tokens';
import { getSolTokenList } from '../data/solanaTokens';
import { disconnectPhantom } from '../lib/solana';
import { useUnifiedWallet } from '../hooks/useUnifiedWallet';
import { CRONOS_MAINNET, CRONOS_TESTNET, SOLANA_MAINNET, SOLANA_DEVNET } from '../types';
import {
  X, ExternalLink, Copy, RefreshCw, Loader2, CheckCircle2, LogOut,
  Activity, ArrowLeftRight, Droplets, Minus, Code, ChevronDown
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  nativeBalance: string | null;
}

export function WalletMenu({ isOpen, onClose, nativeBalance }: Props) {
  const {
    walletAddress, solanaWalletAddress, network, setNetwork, addNotification,
  } = useAppStore();

  const unified = useUnifiedWallet();

  const isSolana = isSolanaNetwork(network);
  const activeWallet = isSolana ? solanaWalletAddress : walletAddress;

  const walletMenuRef = useRef<HTMLDivElement>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (walletMenuRef.current && !walletMenuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Load transactions when menu opens
  useEffect(() => {
    if (!isOpen || !activeWallet) {
      if (!isOpen) setTransactions([]);
      return;
    }
    setTxLoading(true);
    getTransactions({
      walletAddress: activeWallet,
      chainId: network.chainId,
      limit: 10,
    })
      .then(res => setTransactions(res.transactions))
      .catch(err => console.error('Failed to load transactions:', err))
      .finally(() => setTxLoading(false));
  }, [isOpen, activeWallet, network.chainId]);

  // Token balances - only fetch when menu is open
  const { balances: evmBalances, isLoading: evmLoading, refresh: evmRefresh } = useWalletTokens(
    isOpen && !isSolana ? walletAddress : null,
    network.chainId,
  );
  const { balances: solBalances, isLoading: solLoading, refresh: solRefresh } = useSolanaTokens(
    isOpen && isSolana ? solanaWalletAddress : null,
    network.cluster ?? 'mainnet-beta',
  );

  const balances = isSolana ? solBalances : evmBalances;
  const balancesLoading = isSolana ? solLoading : evmLoading;
  const refreshBalances = isSolana ? solRefresh : evmRefresh;

  const evmTokens = getTokenList(network.chainId);
  const solTokens = getSolTokenList(network.cluster ?? 'mainnet-beta');
  const tokens = isSolana ? solTokens : evmTokens;

  const assetRows = tokens.map(token => {
    const key = (isSolana ? (token as any).mint : (token as any).address)?.toLowerCase() ?? '';
    const entry = balances.get(key);
    return {
      token,
      balance: entry?.formattedBalance ?? '—',
      hasBalance: (entry?.rawBalance ?? 0n) > 0n,
      entry,
    };
  }).sort((a, b) => (a.hasBalance === b.hasBalance ? 0 : a.hasBalance ? -1 : 1));

  const explorerAddress = isSolana
    ? `${network.explorerUrl}/address/${activeWallet}`
    : `${network.explorerUrl}/address/${activeWallet}`;

  const disconnect = async () => {
    try {
      if (isSolana) {
        await unified.disconnectSolana();
      } else {
        unified.disconnectEVM();
      }
    } catch (err: any) {
      const parsed = parseChainError(err, isSolana ? 'solana' : 'cronos');
      console.warn('[WalletMenu] disconnect error:', parsed.message);
    }
    onClose();
    addNotification({ type: 'info', title: 'Wallet Disconnected', message: '', duration: 2000 });
  };

  const copyAddress = () => {
    if (!activeWallet) return;
    navigator.clipboard.writeText(activeWallet);
    addNotification({ type: 'success', title: 'Address Copied', message: activeWallet, duration: 2000 });
    onClose();
  };

  const switchNetwork = async (target: typeof CRONOS_MAINNET) => {
    setNetwork(target);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      ref={walletMenuRef}
      className="absolute right-0 mt-2 w-80 bg-slate-900 rounded-2xl shadow-2xl border border-slate-700/80 z-50 overflow-hidden"
    >
      <div className="px-4 py-4 border-b border-slate-800 bg-gradient-to-b from-slate-800/40 to-transparent">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Connected Wallet</p>
              <span className={cn(
                'px-1.5 py-0.5 text-[9px] font-bold rounded uppercase border',
                isSolana
                  ? 'bg-purple-500/15 border-purple-500/30 text-purple-400'
                  : network.isTestnet
                  ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400'
                  : 'bg-green-500/15 border-green-500/30 text-green-400'
              )}>
                {isSolana ? '◎ Solana' : network.isTestnet ? 'Testnet' : 'Mainnet'}
              </span>
            </div>
            <p className="text-white font-mono text-[11px] break-all leading-relaxed">{activeWallet}</p>
            <div className="flex items-center gap-2 mt-1.5">
              {nativeBalance ? (
                <p className={cn(
                  'text-xs font-semibold',
                  isSolana ? 'text-purple-300/70' : 'text-green-300/70'
                )}>
                  {nativeBalance} {network.symbol} <span className="text-slate-600 font-normal">native</span>
                </p>
              ) : (
                <p className={cn(
                  'text-xs animate-pulse',
                  isSolana ? 'text-purple-300/30' : 'text-green-300/30'
                )}>
                  … {network.symbol}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1 flex-shrink-0">
            <button onClick={copyAddress} title="Copy address" className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
              <Copy className="w-3.5 h-3.5" />
            </button>
            <a href={explorerAddress} target="_blank" rel="noreferrer" className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-700 rounded-lg transition-colors">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      <div className="px-3 pt-3 pb-1">
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Wallet Assets</p>
          <button
            onClick={refreshBalances}
            disabled={balancesLoading}
            title="Refresh"
            className="p-1 text-slate-600 hover:text-slate-400 rounded transition-colors"
          >
            {balancesLoading ? <Loader2 className="w-3 h-3 animate-spin text-blue-400" /> : <RefreshCw className="w-3 h-3" />}
          </button>
        </div>
        <div className="max-h-56 overflow-y-auto space-y-0.5 rounded-xl overflow-hidden">
          {assetRows.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-slate-600 text-xs gap-2">
              {balancesLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'No assets found'}
            </div>
          ) : (
            assetRows.map(({ token, balance, hasBalance }) => {
              const sym = isSolana ? (token as any).symbol : (token as any).symbol;
              const name = isSolana ? (token as any).name : (token as any).name;
              const isNative = !!(token as any).isNative;
              const key = isSolana ? (token as any).mint : (token as any).address;
              return (
                <div
                  key={key?.toLowerCase()}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                    hasBalance ? 'bg-slate-800/70 hover:bg-slate-800' : 'opacity-30 hover:opacity-55'
                  )}
                >
                  <div
                    className={cn(
                      'w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white',
                      isNative
                        ? isSolana
                          ? 'bg-gradient-to-br from-purple-500 to-pink-400'
                          : 'bg-gradient-to-br from-blue-500 to-cyan-400'
                        : 'bg-gradient-to-br from-slate-600 to-slate-700'
                    )}
                  >
                    {sym.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-semibold leading-none">{sym}</p>
                    <p className="text-slate-600 text-[10px] truncate leading-none mt-0.5">{name}</p>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                    <p className={cn('text-xs font-semibold tabular-nums flex-shrink-0', hasBalance ? 'text-white' : 'text-slate-700')}>
                      {balance}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {activeWallet && (transactions.length > 0 || txLoading) && (
        <div className="px-3 pt-2 border-t border-slate-800 mt-2">
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Recent Activity</p>
          </div>
          {txLoading ? (
            <div className="flex items-center justify-center py-3 text-slate-500 text-xs gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {transactions.map(tx => {
                const meta = tx.metadata || {};
                const type = meta.type || 'unknown';
                let icon = <Activity className="w-3.5 h-3.5 text-slate-400" />;
                let text = '';
                let textClass = 'text-slate-300';
                switch (type) {
                  case 'swap':
                    text = `Swapped ${meta.amountIn || ''} ${meta.symbolIn || ''} → ${meta.amountOut || ''} ${meta.symbolOut || ''}`;
                    icon = <ArrowLeftRight className="w-3.5 h-3.5 text-blue-400" />;
                    break;
                  case 'mint':
                    text = `Minted NFT${meta.tokenId ? ` #${meta.tokenId}` : meta.collectionName ? ` from ${meta.collectionName}` : ''}`;
                    icon = <Activity className="w-3.5 h-3.5 text-purple-400" />;
                    break;
                  case 'liquidity_add':
                    text = `Added liquidity ${meta.tokenA}/${meta.tokenB}`;
                    icon = <Droplets className="w-3.5 h-3.5 text-cyan-400" />;
                    break;
                  case 'liquidity_remove':
                    text = `Removed liquidity ${meta.tokenA}/${meta.tokenB}`;
                    icon = <Minus className="w-3.5 h-3.5 text-red-400" />;
                    break;
                  case 'deploy':
                    text = `Deployed ${meta.contractType || 'contract'}`;
                    icon = <Code className="w-3.5 h-3.5 text-green-400" />;
                    break;
                  default:
                    text = 'Transaction';
                    textClass = 'text-slate-500';
                }
                return (
                  <a
                    key={tx.id}
                    href={`${network.explorerUrl}/tx/${tx.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors text-xs"
                  >
                    {icon}
                    <span className={cn('flex-1 min-w-0', textClass, 'truncate')}>{text}</span>
                    <span className="text-[10px] text-slate-600 flex-shrink-0">
                      {new Date(tx.confirmedAt || tx.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="px-3 pb-3 pt-2 border-t border-slate-800 mt-2 flex gap-2">
        <a
          href={explorerAddress}
          target="_blank"
          rel="noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-lg transition-colors"
        >
          <ExternalLink className="w-3 h-3" /> Explorer
        </a>
        <button
          onClick={disconnect}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-xs font-medium rounded-lg transition-colors border border-red-500/20"
        >
          <LogOut className="w-3 h-3" /> Disconnect
        </button>
      </div>

      <div className="border-t border-slate-800 mt-2">
        <div className="px-3 py-2">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1.5">Network</p>
          <div className="flex flex-col gap-1">
            <p className="text-xs text-slate-400">Switch network to change wallet context.</p>
            <div className="flex gap-2 flex-wrap">
              {[CRONOS_MAINNET, CRONOS_TESTNET, SOLANA_MAINNET, SOLANA_DEVNET].map(net => {
                const isActive = network.chainId === (net as any).chainId || network.cluster === (net as any).cluster;
                const isSol = isSolanaNetwork(net);
                const dotColor = isSol
                  ? (net as any).isTestnet
                    ? 'bg-orange-500'
                    : 'bg-purple-500'
                  : (net as any).isTestnet
                  ? 'bg-yellow-500'
                  : 'bg-green-500';
                return (
                  <button
                    key={isSol ? (net as any).cluster : (net as any).chainId}
                    onClick={() => switchNetwork(net)}
                    className={cn(
                      'flex-1 text-left px-2 py-1.5 rounded text-xs border transition-colors',
                      isActive
                        ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                        : 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300'
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                      <span className="font-medium">{(net as any).name}</span>
                    </div>
                    <p className="text-[9px] text-slate-500 mt-0.5">
                      {isSol ? (net as any).cluster : `Chain ID: ${(net as any).chainId}`}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default WalletMenu;
