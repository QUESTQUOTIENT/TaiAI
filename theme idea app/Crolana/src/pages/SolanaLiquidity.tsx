

import React, { useState, useEffect, useCallback } from 'react';
import {
  Droplets, Plus, Minus, RefreshCw, ExternalLink, AlertTriangle,
  Loader2, ChevronDown, CheckCircle, Info, TrendingUp, Zap,
} from 'lucide-react';
import { useAppStore } from '../store';
import { getSolTokenList, type SolToken, NATIVE_SOL_MINT } from '../data/solanaTokens';
import { getSolBalance, getSplTokenAccounts, formatSol } from '../lib/solana';
import {
  getTopRaydiumPools, getUserLpPositions, addRaydiumLiquidity, removeRaydiumLiquidity,
  formatPoolTvl, type RaydiumPool, type RaydiumUserPosition,
} from '../lib/raydiumLiquidity';
import { cn } from '../lib/utils';

type Tab = 'add' | 'remove' | 'pools';

export function SolanaLiquidity() {
  const { solanaWalletAddress, network, addNotification, updateNotification } = useAppStore();
  const cluster = network.cluster ?? 'mainnet-beta';
  const tokens   = getSolTokenList(cluster);

  const [tab, setTab] = useState<Tab>('add');
  const [tokenA, setTokenA] = useState<SolToken>(tokens[0]);   
  const [tokenB, setTokenB] = useState<SolToken>(tokens[1] ?? tokens[0]); 
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [removePercent, setRemovePercent] = useState(50);
  const [topPools, setTopPools] = useState<RaydiumPool[]>([]);
  const [positions, setPositions] = useState<RaydiumUserPosition[]>([]);
  const [poolsLoading, setPoolsLoading] = useState(false);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [poolsAreFallback, setPoolsAreFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [balanceA, setBalanceA] = useState('—');
  const [balanceB, setBalanceB] = useState('—');
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);

  useEffect(() => {
    const list = getSolTokenList(cluster);
    setTokenA(list[0]);
    setTokenB(list[1] ?? list[0]);
    setAmountA('');
    setAmountB('');
  }, [cluster]);

  
  useEffect(() => {
    if (tab !== 'pools' && tab !== 'add') return;
    setPoolsLoading(true);
    getTopRaydiumPools(15).then(pools => {
      setTopPools(pools);
      
      if (pools.length > 0 && pools.every(p => p.tvl % 1000 === 0)) {
        setPoolsAreFallback(true);
      }
    }).finally(() => setPoolsLoading(false));
  }, [tab]);

  
  useEffect(() => {
    if (!solanaWalletAddress || tab !== 'remove') return;
    setPositionsLoading(true);
    getUserLpPositions(solanaWalletAddress, cluster).then(setPositions).finally(() => setPositionsLoading(false));
  }, [solanaWalletAddress, tab, cluster]);

  
  const fetchBalances = useCallback(async () => {
    if (!solanaWalletAddress) return;
    try {
      const [lamports, splAccounts] = await Promise.allSettled([
        getSolBalance(solanaWalletAddress, cluster),
        getSplTokenAccounts(solanaWalletAddress, cluster),
      ]);
      const lamps = lamports.status === 'fulfilled' ? lamports.value : 0;
      const spls = splAccounts.status === 'fulfilled' ? splAccounts.value : [];

      const getBal = (t: SolToken) => {
        if (t.isNative) return formatSol(lamps, 4);
        const a = spls.find(s => s.mint.toLowerCase() === t.mint.toLowerCase());
        return a ? (a.uiAmount ?? 0).toFixed(4) : '0';
      };
      setBalanceA(getBal(tokenA));
      setBalanceB(getBal(tokenB));
    } catch {}
  }, [solanaWalletAddress, tokenA, tokenB, cluster]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  const isDevnet = cluster === 'devnet';
  const isMainnet = cluster === 'mainnet-beta';

  const handleAddLiquidity = async () => {
    if (!solanaWalletAddress || !amountA || !amountB) return;
    setError(null);
    setIsSubmitting(true);
    const toastId = addNotification({ type: 'loading', title: 'Adding Liquidity…', message: `${amountA} ${tokenA.symbol} + ${amountB} ${tokenB.symbol}`, duration: 0 });
    try {
      
      const pool = topPools.find(p =>
        (p.baseMint.toLowerCase() === tokenA.mint.toLowerCase() || p.quoteMint.toLowerCase() === tokenA.mint.toLowerCase()) &&
        (p.baseMint.toLowerCase() === tokenB.mint.toLowerCase() || p.quoteMint.toLowerCase() === tokenB.mint.toLowerCase())
      );
      if (!pool) throw new Error('No Raydium pool found for this pair. Create a new pool on raydium.io first.');

      const baseDecimalsA = tokenA.decimals;
      const baseDecimalsB = tokenB.decimals;
      const rawA = (parseFloat(amountA) * 10 ** baseDecimalsA).toString();
      const rawB = (parseFloat(amountB) * 10 ** baseDecimalsB).toString();

      const sig = await addRaydiumLiquidity({ poolId: pool.id, walletAddress: solanaWalletAddress, baseAmount: rawA, quoteAmount: rawB });
      setLastTx(sig);
      updateNotification(toastId, { type: 'success', title: 'Liquidity Added!', message: sig.slice(0, 16) + '…' });
      setAmountA(''); setAmountB('');
      fetchBalances();
    } catch (err: any) {
      const msg = err.message?.slice(0, 200) ?? 'Unknown error';
      updateNotification(toastId, { type: 'error', title: 'Failed', message: msg.slice(0, 80) });
      setError(msg);
      if (err.fallbackUrl) setFallbackUrl(err.fallbackUrl);
    } finally { setIsSubmitting(false); }
  };

  const handleRemoveLiquidity = async () => {
    if (!solanaWalletAddress || !selectedPositionId) return;
    const pos = positions.find(p => p.poolId === selectedPositionId);
    if (!pos) return;
    setIsSubmitting(true);
    const toastId = addNotification({ type: 'loading', title: 'Removing Liquidity…', message: `${removePercent}% of position`, duration: 0 });
    try {
      const lpToRemove = ((pos.lpBalance * removePercent) / 100).toString();
      const sig = await removeRaydiumLiquidity({ poolId: selectedPositionId, walletAddress: solanaWalletAddress, lpAmount: lpToRemove });
      setLastTx(sig);
      updateNotification(toastId, { type: 'success', title: 'Liquidity Removed!', message: sig.slice(0, 16) + '…' });
      setPositions(prev => prev.filter(p => p.poolId !== selectedPositionId));
      setSelectedPositionId(null);
    } catch (err: any) {
      const msg = err.message?.slice(0, 200) ?? 'Unknown error';
      updateNotification(toastId, { type: 'error', title: 'Failed', message: msg.slice(0, 80) });
      setError(msg);
      if (err.fallbackUrl) setFallbackUrl(err.fallbackUrl);
    } finally { setIsSubmitting(false); }
  };

  const TABS: { id: Tab; label: string; icon: typeof Plus }[] = [
    { id: 'add', label: 'Add Liquidity', icon: Plus },
    { id: 'remove', label: 'Remove', icon: Minus },
    { id: 'pools', label: 'Top Pools', icon: TrendingUp },
  ];

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Liquidity Manager</h1>
        <p className="text-slate-400 text-sm">Provide liquidity to Raydium AMM pools on Solana and earn trading fees</p>
      </div>

      {isDevnet && (
        <div className="flex items-start gap-3 p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl text-xs">
          <AlertTriangle className="w-3.5 h-3.5 text-orange-400 mt-0.5 flex-shrink-0" />
          <div className="text-orange-300/90 space-y-1">
            <p><strong className="text-orange-300">Devnet mode.</strong> Raydium AMM pools are Mainnet-only. On devnet you can:</p>
            <ol className="list-decimal list-inside pl-1 text-orange-300/70 space-y-0.5">
              <li>Get devnet SOL from <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" className="underline text-orange-400">faucet.solana.com</a></li>
              <li>Create SPL test tokens via <strong>Token Builder</strong></li>
              <li>Switch to <strong>Mainnet</strong> for Raydium pool interaction</li>
            </ol>
          </div>
        </div>
      )}

      {}
      {poolsAreFallback && (
        <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-xs">
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
          <p className="text-yellow-300/80">Raydium API is temporarily unavailable. Showing curated top pools. Live data will restore automatically.</p>
        </div>
      )}

      {}
      <div className="flex bg-slate-900 rounded-xl border border-slate-800 p-1 gap-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { setTab(id); setError(null); setLastTx(null); setFallbackUrl(null); }}
            className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all',
              tab === id ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30' : 'text-slate-400 hover:text-white')}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {}
      {tab === 'add' && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Add Liquidity to Raydium Pool</h2>

          {}
          <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">Token A</span>
              <span className="text-xs text-slate-400">Balance: {balanceA}</span>
            </div>
            <div className="flex items-center gap-3">
              <SolTokenPicker tokens={tokens} selected={tokenA} onChange={t => { setTokenA(t); setAmountA(''); }} />
              <input type="number" value={amountA} onChange={e => setAmountA(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-transparent text-white text-right text-xl font-bold outline-none placeholder-slate-600" />
            </div>
          </div>

          <div className="flex justify-center"><div className="p-2 rounded-full border border-slate-700 bg-slate-800 text-slate-400"><Plus className="w-3.5 h-3.5" /></div></div>

          {}
          <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">Token B</span>
              <span className="text-xs text-slate-400">Balance: {balanceB}</span>
            </div>
            <div className="flex items-center gap-3">
              <SolTokenPicker tokens={tokens} selected={tokenB} onChange={t => { setTokenB(t); setAmountB(''); }} />
              <input type="number" value={amountB} onChange={e => setAmountB(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-transparent text-white text-right text-xl font-bold outline-none placeholder-slate-600" />
            </div>
          </div>

          {(error || fallbackUrl) && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 space-y-2">
              {error && <p className="text-red-400 text-xs">{error}</p>}
              {fallbackUrl && (
                <a
                  href={fallbackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 underline underline-offset-2"
                >
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  Complete this transaction directly on Raydium ↗
                </a>
              )}
            </div>
          )}

          <button onClick={handleAddLiquidity}
            disabled={!amountA || !amountB || isSubmitting || !solanaWalletAddress || isDevnet}
            className={cn('w-full py-3.5 font-bold rounded-xl text-sm transition-all',
              (!amountA || !amountB || !solanaWalletAddress || isDevnet)
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-500 text-white')}>
            {!solanaWalletAddress ? 'Connect Phantom' : isSubmitting ? 'Adding…' : isDevnet ? 'Mainnet only' : 'Add Liquidity'}
          </button>
        </div>
      )}

      {}
      {tab === 'remove' && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Your Raydium Positions</h2>
          {!solanaWalletAddress ? (
            <p className="text-slate-500 text-sm text-center py-8">Connect Phantom to view your positions</p>
          ) : positionsLoading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading positions…</div>
          ) : positions.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">No Raydium positions found for this wallet{isDevnet ? ' (Mainnet only)' : ''}.</p>
          ) : (
            <div className="space-y-2">
              {positions.map(pos => (
                <button key={pos.poolId} onClick={() => setSelectedPositionId(pos.poolId === selectedPositionId ? null : pos.poolId)}
                  className={cn('w-full p-4 rounded-xl border text-left transition-colors', pos.poolId === selectedPositionId ? 'bg-purple-600/15 border-purple-500/40' : 'bg-slate-800 border-slate-700 hover:border-slate-600')}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-white text-sm">Pool {pos.poolId.slice(0, 8)}…</p>
                      <p className="text-slate-400 text-xs mt-0.5">LP: {pos.lpBalance.toFixed(4)} · Share: {pos.sharePercent.toFixed(4)}%</p>
                    </div>
                    <CheckCircle className={cn('w-4 h-4 transition-colors', pos.poolId === selectedPositionId ? 'text-purple-400' : 'text-slate-700')} />
                  </div>
                </button>
              ))}
            </div>
          )}

          {selectedPositionId && (
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Remove: <span className="text-white font-bold">{removePercent}%</span></span>
                  <div className="flex gap-1">
                    {[25, 50, 75, 100].map(p => (
                      <button key={p} onClick={() => setRemovePercent(p)}
                        className={cn('px-2 py-0.5 rounded text-xs font-bold', removePercent === p ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-400')}>
                        {p}%
                      </button>
                    ))}
                  </div>
                </div>
                <input type="range" min={1} max={100} value={removePercent} onChange={e => setRemovePercent(Number(e.target.value))} className="w-full accent-purple-500" />
              </div>
              <button onClick={handleRemoveLiquidity} disabled={isSubmitting}
                className="w-full py-3 bg-red-500/15 hover:bg-red-500/25 text-red-400 font-bold rounded-xl text-sm border border-red-500/20 transition-colors">
                {isSubmitting ? 'Removing…' : `Remove ${removePercent}% Liquidity`}
              </button>
            </div>
          )}
        </div>
      )}

      {}
      {tab === 'pools' && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <p className="font-bold text-white text-sm">Top Raydium Pools by TVL</p>
            <button onClick={() => { setPoolsLoading(true); getTopRaydiumPools(15).then(setTopPools).finally(() => setPoolsLoading(false)); }} className="p-1.5 text-slate-500 hover:text-white rounded-lg"><RefreshCw className="w-3.5 h-3.5" /></button>
          </div>
          {poolsLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading pools…</div>
          ) : topPools.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-12">No pool data available</p>
          ) : (
            <div className="divide-y divide-slate-800">
              <div className="grid grid-cols-4 px-4 py-2 text-[10px] text-slate-500 uppercase font-semibold tracking-wider">
                <span>Pair</span><span className="text-right">TVL</span><span className="text-right">Vol 24h</span><span className="text-right">APR</span>
              </div>
              {topPools.map(pool => (
                <div key={pool.id} className="grid grid-cols-4 px-4 py-3 hover:bg-slate-800/40 transition-colors">
                  <div>
                    <p className="text-white text-xs font-bold">{pool.baseSymbol}/{pool.quoteSymbol}</p>
                    <p className="text-slate-600 text-[10px]">Raydium AMM</p>
                  </div>
                  <p className="text-right text-slate-300 text-xs">{formatPoolTvl(pool.tvl)}</p>
                  <p className="text-right text-slate-300 text-xs">{formatPoolTvl(pool.volume24h)}</p>
                  <p className={cn('text-right text-xs font-bold', pool.apr24h > 20 ? 'text-green-400' : 'text-slate-300')}>{pool.apr24h.toFixed(1)}%</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {lastTx && (
        <a href={`${network.explorerUrl}/tx/${lastTx}${isDevnet ? '?cluster=devnet' : ''}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-2 text-xs text-green-400 hover:text-green-300">
          <CheckCircle className="w-3.5 h-3.5" /> Transaction confirmed — view on Solscan <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

function SolTokenPicker({ tokens, selected, onChange }: { tokens: SolToken[]; selected: SolToken; onChange: (t: SolToken) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex-shrink-0">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white hover:border-slate-600 transition-colors">
        {selected.symbol} <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-40 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-20 overflow-hidden">
          {tokens.map(t => (
            <button key={t.mint} onClick={() => { onChange(t); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-800 text-left transition-colors">
              <span className="text-slate-300 font-bold">{t.symbol}</span>
              <span className="text-slate-600 truncate">{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export default SolanaLiquidity;
