

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowDownUp, Settings, Loader2, ChevronDown, AlertTriangle, CheckCircle, ExternalLink, RefreshCw, Zap } from 'lucide-react';
import { useAppStore } from '../store';
import { getSolTokenList, type SolToken, NATIVE_SOL_MINT } from '../data/solanaTokens';
import { getSolBalance, formatSol, getSplTokenAccounts } from '../lib/solana';
import {
  getJupiterQuote, buildJupiterSwapTx, signAndSendSolanaSwap,
  solAmountToLamports, lamportsToDisplay, isNativeSOL,
  type JupiterQuoteResult,
} from '../lib/jupiterSwap';
import { cn } from '../lib/utils';

export function SolanaSwap() {
  const { solanaWalletAddress, network, addNotification, updateNotification } = useAppStore();
  const cluster = network.cluster ?? 'mainnet-beta';
  const tokens   = getSolTokenList(cluster);

  const [tokenIn,  setTokenIn]  = useState<SolToken>(tokens[0]);   
  const [tokenOut, setTokenOut] = useState<SolToken>(tokens[1]);   
  const [amountIn,  setAmountIn]  = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [slippageBps, setSlippageBps] = useState(50);  
  const [isQuoting,  setIsQuoting]  = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [priceImpact, setPriceImpact] = useState(0);
  const [balanceIn,  setBalanceIn]  = useState('—');
  const [balanceOut, setBalanceOut] = useState('—');
  const [quoteData, setQuoteData] = useState<JupiterQuoteResult | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showInModal,  setShowInModal]  = useState(false);
  const [showOutModal, setShowOutModal] = useState(false);

  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { const list = getSolTokenList(cluster); setTokenIn(list[0]); setTokenOut(list[1] ?? list[0]); setAmountIn(''); setAmountOut(''); }, [cluster]);

  
  const fetchBalances = useCallback(async () => {
    if (!solanaWalletAddress) return;
    try {
      const [nativeLamports, splAccounts] = await Promise.allSettled([
        getSolBalance(solanaWalletAddress, cluster),
        getSplTokenAccounts(solanaWalletAddress, cluster),
      ]);
      const lamports = nativeLamports.status === 'fulfilled' ? nativeLamports.value : 0;
      const spls = splAccounts.status === 'fulfilled' ? splAccounts.value : [];

      const getBalance = (token: SolToken) => {
        if (token.isNative) return formatSol(lamports, 4);
        const acc = spls.find(s => s.mint.toLowerCase() === token.mint.toLowerCase());
        return acc ? (acc.uiAmount ?? 0).toFixed(4).replace(/\.?0+$/, '') : '0';
      };
      setBalanceIn(getBalance(tokenIn));
      setBalanceOut(getBalance(tokenOut));
    } catch {  }
  }, [solanaWalletAddress, tokenIn, tokenOut, cluster]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  
  useEffect(() => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    if (!amountIn || parseFloat(amountIn) <= 0) { setAmountOut(''); setPriceImpact(0); setQuoteData(null); return; }

    quoteTimer.current = setTimeout(async () => {
      if (tokenIn.mint === tokenOut.mint) return;
      setIsQuoting(true);
      setError(null);
      try {
        const rawAmount = solAmountToLamports(amountIn, tokenIn.decimals);
        if (rawAmount === '0') { setAmountOut(''); return; }
        const quote = await getJupiterQuote({ inputMint: tokenIn.mint, outputMint: tokenOut.mint, amount: rawAmount, slippageBps, cluster });
        setQuoteData(quote);
        setAmountOut(lamportsToDisplay(quote.outAmount, tokenOut.decimals, 6));
        setPriceImpact(parseFloat(quote.priceImpactPct) || 0);
      } catch (err: any) {
        setAmountOut('');
        setQuoteData(null);
        if (!err.message?.includes('Devnet')) setError(err.message?.slice(0, 120));
        else setError(err.message);
      } finally {
        setIsQuoting(false);
      }
    }, 600);
  }, [amountIn, tokenIn, tokenOut, slippageBps, cluster]);

  const handleSwap = async () => {
    if (!solanaWalletAddress || !quoteData) return;
    if (!window.solana?.isPhantom) { setError('Phantom wallet required for Solana swaps.'); return; }

    const toastId = addNotification({ type: 'loading', title: 'Executing Swap…', message: `${amountIn} ${tokenIn.symbol} → ${tokenOut.symbol}`, duration: 0 });
    setIsSwapping(true);
    try {
      const swapTxB64 = await buildJupiterSwapTx({ quoteResponse: quoteData, userPublicKey: solanaWalletAddress });
      const sig = await signAndSendSolanaSwap({ swapTransactionBase64: swapTxB64, cluster });
      setLastTx(sig);
      setAmountIn('');
      setAmountOut('');
      setQuoteData(null);
      updateNotification(toastId, { type: 'success', title: 'Swap Confirmed', message: `${sig.slice(0, 8)}…${sig.slice(-4)}` });
      fetchBalances();
    } catch (err: any) {
      updateNotification(toastId, { type: 'error', title: 'Swap Failed', message: err.message?.slice(0, 100) });
      setError(err.message?.slice(0, 120));
    } finally {
      setIsSwapping(false);
    }
  };

  const flipTokens = () => { setTokenIn(tokenOut); setTokenOut(tokenIn); setAmountIn(amountOut); setAmountOut(''); };

  const slippageOptions = [10, 50, 100, 300];
  const isDevnet = cluster === 'devnet';

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Token Swap</h1>
        <p className="text-slate-400 text-sm">Swap tokens on Solana via Jupiter — best price across all Solana DEXs</p>
      </div>

      {isDevnet && (
        <div className="flex items-start gap-3 p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl text-xs">
          <AlertTriangle className="w-3.5 h-3.5 text-orange-400 mt-0.5 flex-shrink-0" />
          <div className="text-orange-300/90 space-y-1">
            <p><strong className="text-orange-300">Devnet mode.</strong> Jupiter aggregator is Mainnet-only. To test swaps on devnet:</p>
            <ol className="list-decimal list-inside space-y-0.5 pl-1 text-orange-300/70">
              <li>Get free devnet SOL from <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" className="underline text-orange-400">faucet.solana.com</a></li>
              <li>Create SPL test tokens via <strong>Token Builder</strong></li>
              <li>Switch to <strong>Mainnet</strong> for full Jupiter routing</li>
            </ol>
          </div>
        </div>
      )}

      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
        {}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <span className="text-xs text-slate-500 font-medium">Slippage: {(slippageBps / 100).toFixed(1)}%</span>
          <button onClick={() => setShowSettings(!showSettings)} className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>

        {showSettings && (
          <div className="px-5 py-3 border-b border-slate-800 bg-slate-950/30 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400 font-medium">Slippage:</span>
            {slippageOptions.map(bps => (
              <button key={bps} onClick={() => setSlippageBps(bps)}
                className={cn('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors', slippageBps === bps ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white')}>
                {(bps / 100).toFixed(1)}%
              </button>
            ))}
          </div>
        )}

        <div className="p-5 space-y-2">
          {}
          <TokenInput label="You pay" token={tokenIn} amount={amountIn} balance={balanceIn}
            onChange={setAmountIn} onSelectToken={() => setShowInModal(true)}
            onMax={() => setAmountIn(balanceIn === '—' ? '' : balanceIn)} accentColor="purple" />

          {}
          <div className="flex justify-center">
            <button onClick={flipTokens} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white border border-slate-700 transition-all hover:scale-105">
              <ArrowDownUp className="w-4 h-4" />
            </button>
          </div>

          {}
          <TokenInput label="You receive" token={tokenOut} amount={amountOut} balance={balanceOut}
            onChange={() => {}} onSelectToken={() => setShowOutModal(true)}
            readonly isQuoting={isQuoting} accentColor="purple" />

          {}
          {priceImpact > 0 && (
            <div className={cn('px-3 py-2 rounded-lg text-xs flex items-center justify-between', priceImpact > 5 ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-slate-800/50 text-slate-400')}>
              <span>Price impact</span>
              <span className={priceImpact > 5 ? 'text-red-400 font-bold' : ''}>{priceImpact.toFixed(2)}%</span>
            </div>
          )}

          {quoteData && (
            <div className="px-3 py-2 bg-purple-500/5 border border-purple-500/15 rounded-lg text-[11px] text-slate-400 flex items-center gap-2">
              <Zap className="w-3 h-3 text-purple-400 flex-shrink-0" />
              <span>Routed via Jupiter · {quoteData.routePlan?.length ?? 1} hop{(quoteData.routePlan?.length ?? 1) > 1 ? 's' : ''}</span>
              <span className="ml-auto text-purple-400/60">{(slippageBps / 100).toFixed(1)}% max slippage</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <button onClick={handleSwap}
            disabled={!quoteData || isSwapping || isQuoting || !solanaWalletAddress || isDevnet}
            className={cn('w-full py-3.5 font-bold rounded-xl text-sm transition-all',
              (!quoteData || isSwapping || !solanaWalletAddress || isDevnet)
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/30')}>
            {!solanaWalletAddress ? 'Connect Phantom Wallet' : isSwapping ? 'Swapping…' : isQuoting ? 'Getting quote…' : isDevnet ? 'Swap (Mainnet only)' : amountIn ? `Swap ${tokenIn.symbol} → ${tokenOut.symbol}` : 'Enter amount'}
          </button>

          {lastTx && (
            <a href={`${network.explorerUrl}/tx/${lastTx}${cluster === 'devnet' ? '?cluster=devnet' : ''}`}
              target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-2 text-xs text-green-400 hover:text-green-300 py-1">
              <CheckCircle className="w-3.5 h-3.5" /> Last swap confirmed — view on Solscan <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 text-xs text-slate-400 space-y-1">
        <p className="font-semibold text-slate-300">About Jupiter</p>
        <p>Jupiter is Solana's leading swap aggregator, routing through Raydium, Orca, Whirlpools, Meteora, Phoenix, and 20+ liquidity sources to find the best execution price with minimal slippage.</p>
      </div>

      {/* Token selector modals */}
      {showInModal && <SolTokenSelectorModal tokens={tokens} onSelect={t => { setTokenIn(t); setShowInModal(false); setAmountIn(''); }} onClose={() => setShowInModal(false)} selected={tokenIn.mint} title="Select input token" />}
      {showOutModal && <SolTokenSelectorModal tokens={tokens} onSelect={t => { setTokenOut(t); setShowOutModal(false); setAmountOut(''); }} onClose={() => setShowOutModal(false)} selected={tokenOut.mint} title="Select output token" />}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TokenInput({ label, token, amount, balance, onChange, onSelectToken, onMax, readonly, isQuoting, accentColor }: {
  label: string; token: SolToken; amount: string; balance: string;
  onChange: (v: string) => void; onSelectToken: () => void; onMax?: () => void;
  readonly?: boolean; isQuoting?: boolean; accentColor?: string;
}) {
  return (
    <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500">{label}</span>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Balance: <span className="text-slate-400">{balance}</span></span>
          {onMax && balance !== '—' && balance !== '0' && (
            <button onClick={onMax} className="text-purple-400 hover:text-purple-300 font-semibold">MAX</button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={onSelectToken}
          className="flex items-center gap-2.5 px-4 py-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors flex-shrink-0 max-w-32">
          <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white', token.isNative ? 'bg-gradient-to-br from-purple-500 to-pink-400' : 'bg-slate-600')}>
            {token.symbol.slice(0, 2)}
          </div>
          <span className="text-white font-bold text-base truncate min-w-0 max-w-16">{token.symbol}</span>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </button>
        <div className="flex-1 relative">
          {isQuoting && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400 animate-spin" />}
          <input
            type="number" value={amount} onChange={e => onChange(e.target.value)}
            readOnly={readonly} placeholder="0.00"
            className="w-full bg-transparent text-white text-right text-xl font-bold outline-none placeholder-slate-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
      </div>
    </div>
  );
}

function SolTokenSelectorModal({ tokens, onSelect, onClose, selected, title }: {
  tokens: SolToken[]; onSelect: (t: SolToken) => void; onClose: () => void; selected: string; title: string;
}) {
  const [search, setSearch] = useState('');
  const filtered = tokens.filter(t => t.symbol.toLowerCase().includes(search.toLowerCase()) || t.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800">
          <p className="font-bold text-white text-sm">{title}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="px-4 py-3 border-b border-slate-800">
          <input autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by symbol or name…"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-purple-500/50" />
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {filtered.map(t => (
            <button key={t.mint} onClick={() => onSelect(t)}
              className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-colors text-left',
                t.mint === selected ? 'bg-purple-600/20 border border-purple-500/30' : '')}>
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0', t.isNative ? 'bg-gradient-to-br from-purple-500 to-pink-400' : 'bg-slate-700')}>{t.symbol.slice(0, 2)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">{t.symbol}</p>
                <p className="text-slate-500 text-xs truncate">{t.name}</p>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-slate-500 text-sm text-center py-6">No tokens match "{search}"</p>}
        </div>
      </div>
    </div>
  );
}
export default SolanaSwap;
