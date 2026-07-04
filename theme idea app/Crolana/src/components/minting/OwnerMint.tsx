import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { ethers } from 'ethers';
import { Send, Zap, CheckCircle, ExternalLink, Loader2 } from 'lucide-react';

export function OwnerMint() {
  const { deployedAddress, network, addNotification, updateNotification } = useAppStore();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState(1);
  const [isMinting, setIsMinting] = useState(false);
  const [lastTx, setLastTx] = useState('');

  const handleMint = async () => {
    if (!deployedAddress || !recipient.trim()) return;
    if (!ethers.isAddress(recipient.trim())) {
      addNotification({ type: 'error', title: 'Invalid Address', message: 'Enter a valid wallet address.', duration: 4000 });
      return;
    }
    if (!(window as any).ethereum) {
      addNotification({ type: 'error', title: 'No Wallet', message: 'Connect your wallet first.', duration: 4000 });
      return;
    }
    setIsMinting(true);
    const notifId = addNotification({ type: 'loading', title: 'Sending Mint TX', message: 'Waiting for wallet confirmation…', duration: 0 });
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(deployedAddress, ['function ownerMint(address to, uint256 _mintAmount) public'], signer);
      const tx = await contract.ownerMint(recipient.trim(), amount);
      updateNotification(notifId, { type: 'loading', title: 'Mining…', message: `TX: ${tx.hash.slice(0, 12)}…` });
      await tx.wait();
      setLastTx(tx.hash);
      addNotification({ type: 'success', title: `Minted ${amount} Token${amount > 1 ? 's' : ''}`, message: `Sent to ${recipient.slice(0, 6)}…${recipient.slice(-4)}`, duration: 6000 });
      setRecipient(''); setAmount(1);
    } catch (err: any) {
      const msg = err.code === 4001 ? 'Transaction rejected by user.' : (err.reason || err.message || 'Mint failed');
      addNotification({ type: 'error', title: 'Mint Failed', message: msg, duration: 6000 });
    } finally {
      setIsMinting(false);
    }
  };

  return (
    <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 max-w-lg">
      <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
        <Zap className="w-5 h-5 text-yellow-500" /> Owner Mint
      </h3>
      <p className="text-sm text-slate-400 mb-6">Mint tokens directly to any address without paying the mint price. Only callable by contract owner.</p>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Recipient Address</label>
          <input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-white focus:border-yellow-500 outline-none font-mono"
            placeholder="0x…" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Quantity</label>
          <input type="number" value={amount} min={1} max={100} onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-white focus:border-yellow-500 outline-none" />
        </div>
        <button onClick={handleMint} disabled={isMinting || !recipient.trim()}
          className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black rounded-xl font-bold flex items-center justify-center gap-2 transition-colors">
          {isMinting ? <><Loader2 className="w-4 h-4 animate-spin" /> Minting…</> : <><Send className="w-4 h-4" /> Mint {amount} Token{amount > 1 ? 's' : ''}</>}
        </button>
      </div>
      {lastTx && (
        <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-xs text-green-400">Last mint confirmed</span>
          </div>
          <a href={`${network.explorerUrl}/tx/${lastTx}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
            {lastTx.slice(0, 8)}… <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
}
