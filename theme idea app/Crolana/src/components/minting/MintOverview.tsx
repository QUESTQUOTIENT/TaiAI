import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store';
import { ethers } from 'ethers';
import { getReadProvider } from '../../lib/provider';
import { 
  Activity, Users, Coins, Clock, PauseCircle, PlayCircle, 
  ExternalLink, RefreshCw, AlertTriangle, ArrowDownCircle, Loader2
} from 'lucide-react';

export function MintOverview() {
  const { deployedAddress, network, contractConfig } = useAppStore();
  const [stats, setStats] = useState({
    totalSupply: 0,
    maxSupply: 0,
    minted: 0,
    balance: '0.0',
    isPaused: false,
    isRevealed: false
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const { addNotification } = useAppStore();

  const fetchStats = async () => {
    if (!deployedAddress) return;
    setIsLoading(true);
    try {
      const provider = getReadProvider(network.chainId);
      const contract = new ethers.Contract(
        deployedAddress,
        [
          'function totalSupply() view returns (uint256)',
          'function maxSupply() view returns (uint256)',
          'function paused() view returns (bool)',
          'function revealed() view returns (bool)',
        ],
        provider
      );

      const [total, max, paused, revealed] = await Promise.all([
        contract.totalSupply(),
        contract.maxSupply(),
        contract.paused(),
        contract.revealed()
      ]);

      const balance = await provider.getBalance(deployedAddress);

      setStats({
        totalSupply: Number(total),
        maxSupply: Number(max),
        minted: Number(total),
        balance: ethers.formatEther(balance),
        isPaused: paused,
        isRevealed: revealed
      });
    } catch (error) {

    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000); 
    return () => clearInterval(interval);
  }, [deployedAddress]);

  const togglePause = async () => {
    if (!deployedAddress || !(window as any).ethereum) return;
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        deployedAddress,
        ['function setPaused(bool _state) public'],
        signer
      );
      const tx = await contract.setPaused(!stats.isPaused);
      addNotification({ type: 'loading', title: stats.isPaused ? 'Unpausing…' : 'Pausing…', message: `TX: ${tx.hash.slice(0, 10)}…`, duration: 0 });
      await tx.wait();
      fetchStats();
      addNotification({ type: 'success', title: stats.isPaused ? 'Mint Unpaused' : 'Mint Paused', message: 'Contract state updated on-chain.', duration: 4000 });
    } catch (error: any) {
      const msg = error.code === 4001 ? 'Transaction rejected.' : (error.reason || error.message || 'Failed to toggle pause.');
      addNotification({ type: 'error', title: 'Transaction Failed', message: msg, duration: 6000 });
    }
  };


  const withdraw = async () => {
    if (!deployedAddress || parseFloat(stats.balance) === 0) {
      addNotification({ type: 'error', title: 'Nothing to Withdraw', message: 'Contract balance is 0.', duration: 4000 });
      return;
    }
    setIsWithdrawing(true);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        deployedAddress,
        ['function withdraw() public payable'],
        signer
      );
      const tx = await contract.withdraw();
      addNotification({ type: 'loading', title: 'Withdrawing…', message: `TX: ${tx.hash.slice(0, 10)}…`, duration: 0 });
      await tx.wait();
      addNotification({ type: 'success', title: 'Withdrawn!', message: `${stats.balance} ${network.symbol} sent to your wallet.`, duration: 5000 });
      fetchStats();
    } catch (err: any) {
      if (err.code !== 4001) addNotification({ type: 'error', title: 'Withdraw Failed', message: err.message || 'Transaction failed.', duration: 5000 });
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <div className="space-y-6">
      {}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Activity className="w-5 h-5 text-blue-500" />
            </div>
            <span className={`px-2 py-1 rounded text-xs font-bold ${
              stats.isPaused ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
            }`}>
              {stats.isPaused ? 'PAUSED' : 'LIVE'}
            </span>
          </div>
          <div className="text-2xl font-bold text-white mb-1">
            {stats.minted} / {stats.maxSupply}
          </div>
          <div className="text-xs text-slate-500">Total Minted</div>
          <div className="w-full bg-slate-800 h-1.5 mt-3 rounded-full overflow-hidden">
            <div 
              className="bg-blue-500 h-full transition-all duration-500" 
              style={{ width: `${(stats.minted / stats.maxSupply) * 100}%` }}
            />
          </div>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Coins className="w-5 h-5 text-purple-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mb-1">
            {stats.balance} {network.symbol}
          </div>
          <div className="text-xs text-slate-500">Total Raised</div>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <Users className="w-5 h-5 text-orange-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mb-1">
            --
          </div>
          <div className="text-xs text-slate-500">Unique Holders</div>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-cyan-500/10 rounded-lg">
              <Clock className="w-5 h-5 text-cyan-500" />
            </div>
          </div>
          <div className="text-lg font-bold text-white mb-1 truncate">
            {deployedAddress ? `${deployedAddress.slice(0, 6)}...${deployedAddress.slice(-4)}` : 'Not Deployed'}
          </div>
          <a 
            href={`${network.explorerUrl}/address/${deployedAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            View on Explorer <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {}
      <div className="flex gap-4">
        <button 
          onClick={togglePause}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-colors ${
            stats.isPaused 
              ? 'bg-green-600 hover:bg-green-700 text-white' 
              : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
        >
          {stats.isPaused ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
          {stats.isPaused ? 'Unpause Mint' : 'Pause Mint'}
        </button>
        
        <button
          onClick={withdraw}
          disabled={isWithdrawing || parseFloat(stats.balance) === 0}
          className="flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white rounded-lg font-bold transition-colors"
        >
          {isWithdrawing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownCircle className="w-4 h-4" />}
          Withdraw {stats.balance} {network.symbol}
        </button>

        <button 
          onClick={fetchStats}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Data
        </button>
      </div>
    </div>
  );
}
