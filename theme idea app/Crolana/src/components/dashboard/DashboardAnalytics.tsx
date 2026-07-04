import React, { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../../store';
import { ethers } from 'ethers';
import { getReadProvider } from '../../lib/provider';
import { Activity, TrendingUp, Users, Coins, Zap, Clock, ExternalLink, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

const CONTRACT_ABI = [
  'function totalSupply() view returns (uint256)',
  'function maxSupply() view returns (uint256)',
  'function cost() view returns (uint256)',
  'function paused() view returns (bool)',
  'function revealed() view returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

interface LiveStats {
  totalSupply: number;
  maxSupply: number;
  mintCost: string;
  contractBalance: string;
  isPaused: boolean;
  isRevealed: boolean;
}

export function DashboardAnalytics() {
  const { deployedAddress, network, mintPhases } = useAppStore();
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [recentMints, setRecentMints] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!deployedAddress) return;
    setIsLoading(true);
    try {
      const provider = getReadProvider(network.chainId);
      const contract = new ethers.Contract(deployedAddress, CONTRACT_ABI, provider);

      const [totalSupply, maxSupply, cost, balance, paused, revealed] = await Promise.allSettled([
        contract.totalSupply(),
        contract.maxSupply(),
        contract.cost(),
        provider.getBalance(deployedAddress),
        contract.paused(),
        contract.revealed(),
      ]);

      setStats({
        totalSupply: totalSupply.status === 'fulfilled' ? Number(totalSupply.value) : 0,
        maxSupply: maxSupply.status === 'fulfilled' ? Number(maxSupply.value) : 0,
        mintCost: cost.status === 'fulfilled' ? ethers.formatEther(cost.value) : '0',
        contractBalance: balance.status === 'fulfilled' ? parseFloat(ethers.formatEther(balance.value)).toFixed(4) : '0',
        isPaused: paused.status === 'fulfilled' ? paused.value : false,
        isRevealed: revealed.status === 'fulfilled' ? revealed.value : false,
      });

      
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 10000);
      try {
        const logs = await contract.queryFilter(
          contract.filters.Transfer(ethers.ZeroAddress),
          fromBlock, currentBlock
        ) as ethers.EventLog[];
        
        setRecentMints(logs.reverse().slice(0, 8).map((log) => ({
          tokenId: ((log.args as any)[2] as bigint)?.toString(),
          to: ((log.args as any)[1] as string),
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        })));
      } catch {  }

      setIsLive(true);
    } catch (err) {

    } finally {
      setIsLoading(false);
    }
  }, [deployedAddress, network.chainId]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 20000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (!deployedAddress) return null;
  if (!stats && !isLoading) return null;
  if (!stats) return (
    <div className="flex items-center gap-3 text-slate-500 text-sm py-4">
      <RefreshCw className="w-4 h-4 animate-spin" /> Loading contract data…
    </div>
  );

  const activePhase = mintPhases.find((p) => {
    const now = Date.now();
    return new Date(p.startTime).getTime() <= now && new Date(p.endTime).getTime() >= now;
  });

  return (
    <div className="space-y-5">
      {}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isLive && (
            <><span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
            <span className="text-xs text-green-400 font-semibold">Live On-Chain</span></>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchStats} disabled={isLoading} className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <Link to="/analytics" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">Full Analytics →</Link>
        </div>
      </div>

      {}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 text-slate-500 mb-2 text-xs font-semibold uppercase tracking-wide">
            <Activity className="w-3.5 h-3.5" /> Minted
          </div>
          <div className="text-xl font-bold text-white">{stats.totalSupply}</div>
          <div className="text-xs text-slate-600 mt-0.5">/ {stats.maxSupply}</div>
          <div className="w-full bg-slate-800 h-1 mt-2 rounded-full overflow-hidden">
            <div className="bg-blue-500 h-1 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, (stats.totalSupply / Math.max(1, stats.maxSupply)) * 100)}%` }} />
          </div>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 text-slate-500 mb-2 text-xs font-semibold uppercase tracking-wide">
            <Coins className="w-3.5 h-3.5" /> Balance
          </div>
          <div className="text-xl font-bold text-green-400">{stats.contractBalance}</div>
          <div className="text-xs text-slate-600 mt-0.5">{network.symbol}</div>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 text-slate-500 mb-2 text-xs font-semibold uppercase tracking-wide">
            <Zap className="w-3.5 h-3.5" /> Mint Price
          </div>
          <div className="text-xl font-bold text-white">{stats.mintCost}</div>
          <div className="text-xs text-slate-600 mt-0.5">{network.symbol} each</div>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 text-slate-500 mb-2 text-xs font-semibold uppercase tracking-wide">
            <TrendingUp className="w-3.5 h-3.5" /> Status
          </div>
          <div className={`text-sm font-bold ${stats.isPaused ? 'text-red-400' : 'text-green-400'}`}>
            {stats.isPaused ? '⏸ Paused' : '▶ Live'}
          </div>
          <div className={`text-xs mt-0.5 ${stats.isRevealed ? 'text-green-400' : 'text-slate-500'}`}>
            {stats.isRevealed ? '👁 Revealed' : '🔒 Hidden'}
          </div>
        </div>
      </div>

      {}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {}
        <div className="bg-slate-900 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-white text-sm">Mint Phases</span>
          </div>
          <div className="p-4 space-y-3">
            {mintPhases.length === 0 ? (
              <p className="text-slate-600 text-xs text-center py-2">No phases configured. <Link to="/minting" className="text-blue-400 hover:text-blue-300">Set up phases →</Link></p>
            ) : mintPhases.map((phase, i) => {
              const now = Date.now();
              const start = new Date(phase.startTime).getTime();
              const end = new Date(phase.endTime).getTime();
              const isActive = start <= now && end >= now;
              return (
                <div key={phase.id} className={`flex items-center justify-between p-2.5 rounded-lg ${isActive ? 'bg-green-500/10 border border-green-500/20' : 'bg-slate-800/50'}`}>
                  <div>
                    <p className={`text-xs font-bold ${isActive ? 'text-green-400' : 'text-slate-400'}`}>{phase.name}</p>
                    <p className="text-[10px] text-slate-600">{phase.type === 'allowlist' ? 'Allowlist' : 'Public'}</p>
                  </div>
                  <span className={`text-xs font-mono ${isActive ? 'text-green-400' : 'text-slate-500'}`}>{phase.price} {network.symbol}</span>
                </div>
              );
            })}
          </div>
        </div>

        {}
        <div className="bg-slate-900 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              <span className="font-bold text-white text-sm">Recent Mints</span>
            </div>
          </div>
          <div className="divide-y divide-slate-800/50">
            {recentMints.length === 0 ? (
              <p className="text-slate-600 text-xs text-center py-6">No mints detected yet.</p>
            ) : recentMints.map((mint, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/30 transition-colors">
                <span className="text-slate-500 text-[10px] font-mono w-8 flex-shrink-0">#{mint.tokenId}</span>
                <span className="text-slate-400 font-mono text-xs flex-1 truncate">{mint.to?.slice(0, 8)}…{mint.to?.slice(-4)}</span>
                <a href={`${network.explorerUrl}/tx/${mint.txHash}`} target="_blank" rel="noreferrer"
                  className="text-blue-400 hover:text-blue-300 flex-shrink-0">
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
