

import React, { useState } from 'react';
import {
  Coins, CheckCircle, ExternalLink, Loader2, AlertTriangle, Info,
  Lock, Unlock, Shield, Zap, Copy,
} from 'lucide-react';
import { useAppStore } from '../store';
import { createSplToken, type SplTokenConfig } from '../lib/solanaSpl';
import { cn } from '../lib/utils';

const DEFAULT_CONFIG: SplTokenConfig = {
  name: '',
  symbol: '',
  decimals: 6,
  initialSupply: '1000000',
  description: '',
  imageUri: '',
  revokeMintAuthority: false,
  revokeFreezeAuthority: true,
  cluster: 'mainnet-beta',
};

export function SolanaTokenBuilder() {
  const { solanaWalletAddress, network, addNotification, updateNotification } = useAppStore();
  const cluster = network.cluster ?? 'mainnet-beta';

  const [config, setConfig] = useState<SplTokenConfig>({ ...DEFAULT_CONFIG, cluster });
  const [isDeploying, setIsDeploying] = useState(false);
  const [result, setResult] = useState<{ mintAddress: string; txSignature: string; explorerUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  
  React.useEffect(() => { setConfig(prev => ({ ...prev, cluster })); }, [cluster]);

  const update = (partial: Partial<SplTokenConfig>) => setConfig(prev => ({ ...prev, ...partial }));

  const handleDeploy = async () => {
    if (!solanaWalletAddress) { setError('Connect Phantom wallet first.'); return; }
    if (!config.name.trim() || !config.symbol.trim()) { setError('Name and symbol are required.'); return; }
    if (parseFloat(config.initialSupply) <= 0) { setError('Initial supply must be greater than 0.'); return; }

    setError(null);
    setIsDeploying(true);
    const toastId = addNotification({ type: 'loading', title: 'Creating SPL Token…', message: `Deploying ${config.symbol} on ${network.name}`, duration: 0 });

    try {
      const res = await createSplToken({ ...config, cluster });
      setResult(res);
      updateNotification(toastId, {
        type: 'success',
        title: `${config.symbol} Token Created!`,
        message: `Mint: ${res.mintAddress.slice(0, 8)}…${res.mintAddress.slice(-4)}`,
      });
    } catch (err: any) {
      const msg = err.message?.slice(0, 150) ?? 'Unknown error';
      setError(msg);
      updateNotification(toastId, { type: 'error', title: 'Deployment Failed', message: msg });
    } finally {
      setIsDeploying(false);
    }
  };

  const copyMint = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.mintAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const explorerCluster = cluster === 'devnet' ? '?cluster=devnet' : '';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">SPL Token Builder</h1>
        <p className="text-slate-400 text-sm">Deploy a custom SPL token on Solana {cluster === 'devnet' ? '(Devnet)' : '(Mainnet)'} — no coding required</p>
      </div>

      <div className="flex items-start gap-3 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl text-sm">
        <Info className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
        <p className="text-purple-300/80 text-xs leading-relaxed">
          SPL tokens are Solana's token standard — equivalent to ERC-20 on Ethereum. This tool deploys a mint account on-chain,
          mints the initial supply to your wallet, and optionally revokes the mint authority to create a fixed-supply token.
          All transactions are signed by your Phantom wallet.
          {cluster === 'devnet' && ' <strong>Devnet mode</strong> — get free SOL from faucet.solana.com before deploying.'}
        </p>
      </div>

      {result ? (
        // ─── Success State ───────────────────────────────────────────────────
        <div className="bg-slate-900 rounded-2xl border border-green-500/30 bg-green-500/5 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{config.name} ({config.symbol}) Deployed!</h2>
              <p className="text-sm text-green-400/80">SPL token live on {network.name}</p>
            </div>
          </div>

          <div className="bg-slate-950/50 rounded-xl p-4 space-y-3">
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Mint Address</p>
              <div className="flex items-center gap-2">
                <p className="text-white font-mono text-xs break-all flex-1">{result.mintAddress}</p>
                <button onClick={copyMint} className="flex-shrink-0 p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
                  {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2">
              {[
                { label: 'Supply', value: parseInt(config.initialSupply).toLocaleString() + ' ' + config.symbol },
                { label: 'Decimals', value: config.decimals.toString() },
                { label: 'Mint Authority', value: config.revokeMintAuthority ? 'Revoked ✓' : 'You' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-900 rounded-lg p-2.5">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-0.5">{label}</p>
                  <p className="text-white text-xs font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <a href={result.explorerUrl} target="_blank" rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-colors">
              <ExternalLink className="w-3.5 h-3.5" /> View on Solscan
            </a>
            <button onClick={() => { setResult(null); setConfig({ ...DEFAULT_CONFIG, cluster }); }}
              className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-bold transition-colors">
              Create Another
            </button>
          </div>

          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300/80">
            <strong className="text-blue-300">Next steps:</strong> Add your token to Jupiter for swapping, or create a Raydium pool (pair with SOL) in the Liquidity Manager to enable trading.
          </div>
        </div>
      ) : (
        // ─── Config Form ─────────────────────────────────────────────────────
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Token Details</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Token Name *</label>
                <input type="text" value={config.name} onChange={e => update({ name: e.target.value })}
                  placeholder="My Solana Token" maxLength={32}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-purple-500/50" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Symbol *</label>
                <input type="text" value={config.symbol} onChange={e => update({ symbol: e.target.value.toUpperCase() })}
                  placeholder="MTKN" maxLength={10}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-purple-500/50" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Initial Supply *</label>
                <input type="number" value={config.initialSupply} onChange={e => update({ initialSupply: e.target.value })}
                  placeholder="1000000"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-purple-500/50" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Decimals (0–9)</label>
                <select value={config.decimals} onChange={e => update({ decimals: parseInt(e.target.value) })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-purple-500/50">
                  {[0, 2, 4, 6, 8, 9].map(d => <option key={d} value={d}>{d}{d === 6 ? ' (recommended)' : d === 9 ? ' (SOL-like)' : ''}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Token Logo URI (IPFS)</label>
              <input type="text" value={config.imageUri ?? ''} onChange={e => update({ imageUri: e.target.value })}
                placeholder="ipfs://Qm… (optional — upload via IPFS Manager)"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-purple-500/50" />
            </div>
          </div>

          {/* Authority Settings */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-3">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Authority Settings</h2>

            <AuthorityToggle
              icon={Lock} label="Revoke Mint Authority"
              description="Permanently fix the token supply. No additional tokens can ever be minted. Recommended for trustless launches."
              enabled={config.revokeMintAuthority} onChange={v => update({ revokeMintAuthority: v })} warningColor="green" />

            <AuthorityToggle
              icon={Shield} label="Revoke Freeze Authority"
              description="Tokens can never be frozen or confiscated. Users can always transfer their tokens freely."
              enabled={config.revokeFreezeAuthority} onChange={v => update({ revokeFreezeAuthority: v })} warningColor="blue" />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{error}
            </div>
          )}

          <button onClick={handleDeploy} disabled={isDeploying || !solanaWalletAddress}
            className={cn('w-full py-4 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2',
              !solanaWalletAddress ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                : isDeploying ? 'bg-purple-700 text-white cursor-wait'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/30')}>
            {isDeploying ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating Token…</> :
             !solanaWalletAddress ? 'Connect Phantom Wallet' :
             <><Zap className="w-4 h-4" /> Deploy SPL Token on {network.name}</>}
          </button>
        </div>
      )}
    </div>
  );
}

function AuthorityToggle({ icon: Icon, label, description, enabled, onChange, warningColor }: {
  icon: typeof Lock; label: string; description: string; enabled: boolean;
  onChange: (v: boolean) => void; warningColor: 'green' | 'blue';
}) {
  return (
    <button onClick={() => onChange(!enabled)}
      className={cn('w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all',
        enabled
          ? warningColor === 'green' ? 'bg-green-500/10 border-green-500/30' : 'bg-blue-500/10 border-blue-500/30'
          : 'bg-slate-800/40 border-slate-700 hover:border-slate-600')}>
      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
        enabled ? (warningColor === 'green' ? 'bg-green-500/20' : 'bg-blue-500/20') : 'bg-slate-700')}>
        <Icon className={cn('w-3.5 h-3.5', enabled ? (warningColor === 'green' ? 'text-green-400' : 'text-blue-400') : 'text-slate-400')} />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-white">{label}</p>
          {enabled && <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded uppercase', warningColor === 'green' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400')}>Active</span>}
        </div>
        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{description}</p>
      </div>
    </button>
  );
}
export default SolanaTokenBuilder;
