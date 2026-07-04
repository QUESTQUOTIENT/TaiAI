
import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { Zap, RefreshCw, ExternalLink, AlertTriangle, CheckCircle, Users, Coins, Shield } from 'lucide-react';

const MINT_ABI = [
  'function mint(uint256 _mintAmount) external payable',
  'function cost() view returns (uint256)',
  'function maxSupply() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function maxMintAmountPerTx() view returns (uint256)',
  'function paused() view returns (bool)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function balanceOf(address owner) view returns (uint256)',
];

interface LiveData {
  name: string; symbol: string; totalSupply: number;
  maxSupply: number; cost: bigint; maxPerTx: number; paused: boolean;
}

function getRpcUrl(chainId: number) {
  return `${window.location.origin}/api/rpc/${chainId}`;
}

function getExplorer(chainId: number, address: string) {
  const base = chainId === 25
    ? 'https://explorer.cronos.org/address'
    : 'https://testnet.cronoscan.com/address';
  return `${base}/${address}`;
}

export function PublicMint() {
  const params   = new URLSearchParams(window.location.search);
  const contract = params.get('contract') || '';
  const chainId  = parseInt(params.get('chain') || '25', 10);
  const name_    = params.get('name') || '';
  const desc_    = params.get('desc') || 'Join this exclusive NFT collection.';
  const accent   = params.get('accent') || '#3b82f6';
  const banner   = params.get('banner') || '#0f172a';
  const discord_ = params.get('discord') || '';
  const twitter_ = params.get('twitter') || '';
  const msg_     = params.get('msg') || '';

  const [live, setLive]         = useState<LiveData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [amount, setAmount]     = useState(1);
  const [wallet, setWallet]     = useState('');
  const [isMinting, setMinting] = useState(false);
  const [txHash, setTxHash]     = useState('');
  const [userBal, setUserBal]   = useState(0);
  const [status, setStatus]     = useState('');

  const fetch_ = useCallback(async () => {
    if (!contract || !ethers.isAddress(contract)) {
      setError('Invalid contract address.'); setLoading(false); return;
    }
    setLoading(true); setError('');
    try {
      const provider = new ethers.JsonRpcProvider(getRpcUrl(chainId));
      const c = new ethers.Contract(contract, MINT_ABI, provider);
      const [name, symbol, total, max, cost, maxTx, paused] = await Promise.all([
        c.name(), c.symbol(), c.totalSupply(), c.maxSupply(),
        c.cost(), c.maxMintAmountPerTx(), c.paused(),
      ]);
      setLive({ name, symbol, totalSupply: Number(total), maxSupply: Number(max), cost, maxPerTx: Number(maxTx), paused });
    } catch (e: any) {
      setError('Could not load contract. Check the address and network.');
    } finally { setLoading(false); }
  }, [contract, chainId]);

  useEffect(() => { fetch_(); }, [fetch_]);

  useEffect(() => {
    const check = async () => {
      if (!wallet || !contract || !live) return;
      try {
        const p = new ethers.JsonRpcProvider(getRpcUrl(chainId));
        const c = new ethers.Contract(contract, MINT_ABI, p);
        setUserBal(Number(await c.balanceOf(wallet)));
      } catch {}
    };
    check();
  }, [wallet, contract, chainId, live]);

  const connectWallet = async () => {
    const w = window as any;
    if (!w.ethereum) { alert('Please install MetaMask or open in a Web3 wallet browser.'); return; }
    const accounts = await w.ethereum.request({ method: 'eth_requestAccounts' });
    setWallet(accounts[0]);
    try {
      await w.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${chainId.toString(16)}` }] });
    } catch {}
  };

  const mint = async () => {
    if (!wallet || !live || !contract) return;
    setMinting(true); setStatus('Waiting for wallet…'); setTxHash('');
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer   = await provider.getSigner();
      const net      = await provider.getNetwork();
      if (Number(net.chainId) !== chainId) {
        setStatus('Please switch to the correct network in your wallet.');
        setMinting(false); return;
      }
      const c    = new ethers.Contract(contract, MINT_ABI, signer);
      const cost = live.cost * BigInt(amount);
      setStatus('Confirm in wallet…');
      const tx = await c.mint(amount, { value: cost });
      setStatus('Transaction sent — waiting for confirmation…');
      await tx.wait();
      setTxHash(tx.hash);
      setStatus('');
      fetch_();
    } catch (e: any) {
      const msg = e.reason || e.shortMessage || e.message || 'Transaction failed';
      if (!msg.toLowerCase().includes('rejected') && !msg.toLowerCase().includes('denied')) {
        setStatus(`Error: ${msg}`);
      } else {
        setStatus('');
      }
    } finally { setMinting(false); }
  };

  const progressPct = live ? Math.min(100, (live.totalSupply / live.maxSupply) * 100) : 0;
  const displayName = live?.name || name_ || 'NFT Collection';

  return (
    <div className="min-h-screen flex flex-col items-center justify-start py-10 px-4"
      style={{ background: banner, fontFamily: 'system-ui, sans-serif' }}>

      {}
      <div className="w-full max-w-md bg-slate-900/80 backdrop-blur rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
        {}
        <div className="h-2" style={{ background: accent }} />

        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h1 className="text-2xl font-black text-white">{displayName}</h1>
              {live && <p className="text-slate-400 text-sm">{live.symbol}</p>}
            </div>
            {contract && (
              <a href={getExplorer(chainId, contract)} target="_blank" rel="noreferrer"
                className="flex-shrink-0 p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">
                <ExternalLink className="w-4 h-4 text-slate-400" />
              </a>
            )}
          </div>

          <p className="text-slate-400 text-sm mb-5 leading-relaxed">{desc_}</p>

          {}
          {loading && (
            <div className="flex items-center gap-2 py-6 justify-center text-slate-500">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading contract…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {live && !loading && (
            <>
              {}
              <div className="mb-5">
                <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                  <span>Minted</span>
                  <span className="font-bold text-white">{live.totalSupply.toLocaleString()} / {live.maxSupply.toLocaleString()}</span>
                </div>
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: accent }} />
                </div>
                <p className="text-right text-xs text-slate-500 mt-1">{progressPct.toFixed(1)}% minted</p>
              </div>

              {}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-slate-800 rounded-xl p-3 flex items-center gap-2">
                  <Coins className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Price</p>
                    <p className="text-sm font-bold text-white">{ethers.formatEther(live.cost)} CRO</p>
                  </div>
                </div>
                <div className="bg-slate-800 rounded-xl p-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Max / TX</p>
                    <p className="text-sm font-bold text-white">{live.maxPerTx}</p>
                  </div>
                </div>
              </div>

              {}
              {live.paused && (
                <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl mb-4">
                  <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                  <p className="text-sm text-yellow-300">Minting is currently paused.</p>
                </div>
              )}

              {}
              {txHash && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl mb-4">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-green-300 font-semibold">Mint successful! 🎉</p>
                    <a href={`${getExplorer(chainId, contract).replace('/address/', '/tx/')}${txHash}`}
                      target="_blank" rel="noreferrer"
                      className="text-xs text-green-400/70 hover:text-green-400 font-mono truncate block">
                      {txHash.slice(0, 20)}…
                    </a>
                  </div>
                </div>
              )}

              {}
              {status && (
                <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl mb-4">
                  <RefreshCw className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
                  <p className="text-sm text-blue-300">{status}</p>
                </div>
              )}

              {}
              {!live.paused && (
                <div className="space-y-3">
                  {}
                  <div className="flex items-center gap-3">
                    <button onClick={() => setAmount(a => Math.max(1, a - 1))}
                      className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xl font-bold transition-colors flex-shrink-0 flex items-center justify-center">−</button>
                    <div className="flex-1 text-center">
                      <p className="text-2xl font-black text-white">{amount}</p>
                      <p className="text-xs text-slate-500">{ethers.formatEther(live.cost * BigInt(amount))} CRO total</p>
                    </div>
                    <button onClick={() => setAmount(a => Math.min(live.maxPerTx, a + 1))}
                      className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xl font-bold transition-colors flex-shrink-0 flex items-center justify-center">+</button>
                  </div>

                  {wallet ? (
                    <>
                      {userBal > 0 && (
                        <p className="text-center text-xs text-slate-500">You own {userBal} from this collection</p>
                      )}
                      <button onClick={mint} disabled={isMinting}
                        className="w-full py-3.5 rounded-xl font-black text-white text-base transition-all disabled:opacity-50"
                        style={{ background: accent }}>
                        {isMinting ? 'Minting…' : `Mint ${amount} NFT${amount > 1 ? 's' : ''}`}
                      </button>
                      <p className="text-center text-xs text-slate-600 font-mono">{wallet.slice(0, 8)}…{wallet.slice(-4)}</p>
                    </>
                  ) : (
                    <button onClick={connectWallet}
                      className="w-full py-3.5 rounded-xl font-black text-white text-base transition-all"
                      style={{ background: accent }}>
                      <Zap className="w-4 h-4 inline mr-2" />Connect Wallet to Mint
                    </button>
                  )}
                </div>
              )}

              {}
              {msg_ && (
                <div className="mt-4 p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                  <p className="text-sm text-slate-300 text-center">{msg_}</p>
                </div>
              )}
            </>
          )}
        </div>

        {}
        <div className="px-6 pb-5 flex items-center justify-between">
          <div className="flex gap-3">
            {discord_ && (
              <a href={discord_} target="_blank" rel="noreferrer"
                className="text-xs text-slate-500 hover:text-indigo-400 font-medium transition-colors">Discord</a>
            )}
            {twitter_ && (
              <a href={twitter_} target="_blank" rel="noreferrer"
                className="text-xs text-slate-500 hover:text-blue-400 font-medium transition-colors">Twitter</a>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Shield className="w-3 h-3 text-slate-600" />
            <span className="text-[10px] text-slate-600">Powered by Crolana</span>
          </div>
        </div>
      </div>

      {}
      <button onClick={fetch_}
        className="mt-4 flex items-center gap-2 px-3 py-1.5 bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-slate-300 rounded-lg text-xs transition-colors">
        <RefreshCw className="w-3 h-3" /> Refresh
      </button>
    </div>
  );
}
export default PublicMint;
