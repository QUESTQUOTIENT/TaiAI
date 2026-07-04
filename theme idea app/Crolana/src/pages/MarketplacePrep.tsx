import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { ethers } from 'ethers';
import { getReadProvider } from '../lib/provider';
import { CheckCircle, AlertTriangle, Shield, Coins, Eye, Link as LinkIcon, RefreshCw, ExternalLink, Search, FileJson, Copy, Loader2, Store, Zap, Globe } from 'lucide-react';


const CRONOS_MARKETPLACES = [
  {
    name: "Minted",
    description: "Premier Cronos NFT marketplace — list, buy, and sell Cronos NFTs.",
    url: "https://minted.network/",
    listUrl: (contract: string) => `https://minted.network/collection/${contract}`,
    icon: "🟣",
    recommended: true,
    features: ["Cronos native", "Low fees", "Creator royalties"],
  },
  {
    name: "Ebisu's Bay",
    description: "Original Cronos marketplace with large established community.",
    url: "https://app.ebisusbay.com/",
    listUrl: (contract: string) => `https://app.ebisusbay.com/collection/${contract}`,
    icon: "🐉",
    recommended: true,
    features: ["Verified collections", "Launchpad", "Staking"],
  },
  {
    name: "OpenSea",
    description: "World's largest NFT marketplace — supports Cronos chain.",
    url: "https://opensea.io/",
    listUrl: (contract: string) => `https://opensea.io/assets/cronos/${contract}`,
    icon: "🌊",
    recommended: false,
    features: ["Largest user base", "Cross-chain", "Auto-detect"],
  },
  {
    name: "tofuNFT",
    description: "Multi-chain NFT marketplace with Cronos support.",
    url: "https://tofunft.com/",
    listUrl: (contract: string) => `https://tofunft.com/collection/cronos/${contract}/items`,
    icon: "🧊",
    recommended: false,
    features: ["Multi-chain", "Low fees", "Active community"],
  },
];


export function MarketplacePrep() {
  const { deployedAddress, network, advancedContractConfig, addNotification } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [royaltyInfo, setRoyaltyInfo] = useState({ receiver: '', percentage: 0 });
  const [newRoyaltyReceiver, setNewRoyaltyReceiver] = useState('');
  const [newRoyaltyPercentage, setNewRoyaltyPercentage] = useState('');
  const [revealState, setRevealState] = useState({ revealed: false, baseURI: '', hiddenURI: '' });
  const [metadataStatus, setMetadataStatus] = useState<'unknown' | 'valid' | 'invalid'>('unknown');
  const [contractURI, setContractURI] = useState('');
  const [newContractURI, setNewContractURI] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const getProvider = () => {
    if (!(window as any).ethereum) throw new Error('No wallet detected. Please install MetaMask.');
    return getReadProvider(network.chainId);
  };

  const fetchContractData = async () => {
    if (!deployedAddress || !(window as any).ethereum) return;
    setIsLoading(true);
    try {
      const provider = getReadProvider(network.chainId);
      const contract = new ethers.Contract(deployedAddress, [
        'function royaltyInfo(uint256 tokenId, uint256 salePrice) view returns (address, uint256)',
        'function revealed() view returns (bool)',
        'function baseURI() view returns (string)',
        'function hiddenMetadataUri() view returns (string)',
        'function contractURI() view returns (string)',
      ], provider);

      const results = await Promise.allSettled([
        contract.royaltyInfo(1, 10000),
        contract.revealed(),
        contract.baseURI(),
        contract.hiddenMetadataUri(),
        contract.contractURI(),
      ]);

      if (results[0].status === 'fulfilled') {
        const [receiver, amount] = results[0].value;
        setRoyaltyInfo({ receiver, percentage: Number(amount) / 100 });
      }
      const revealed = results[1].status === 'fulfilled' ? results[1].value : false;
      const baseURI = results[2].status === 'fulfilled' ? results[2].value : '';
      const hiddenURI = results[3].status === 'fulfilled' ? results[3].value : '';
      if (results[1].status === 'fulfilled') setRevealState({ revealed, baseURI, hiddenURI });
      if (results[4].status === 'fulfilled') setContractURI(results[4].value);
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Could not read contract', message: err.message, duration: 5000 });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchContractData(); }, [deployedAddress]);

  const handleVerifyContract = async () => {
    if (!deployedAddress) return;
    setActionLoading('verify');
    try {
      const res = await fetch('/api/contract/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: deployedAddress, network: network.chainId }),
      });
      const data = await res.json();
      if (data.verified || data.alreadyVerified) {
        setIsVerified(true);
        addNotification({ type: 'success', title: 'Contract Verified', message: 'Source code is now public on the block explorer.', duration: 5000 });
      } else {
        const msg = data.message || data.error || 'Verification failed';
        addNotification({ type: 'info', title: 'Verification Info', message: msg, duration: 8000 });
        if (data.manualUrl) window.open(data.manualUrl, '_blank');
      }
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Verification Error', message: err.message, duration: 6000 });
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateRoyalty = async () => {
    if (!deployedAddress || !newRoyaltyReceiver || !newRoyaltyPercentage) return;
    if (!ethers.isAddress(newRoyaltyReceiver)) {
      addNotification({ type: 'error', title: 'Invalid Address', message: 'Enter a valid Ethereum address.', duration: 4000 });
      return;
    }
    const pct = parseFloat(newRoyaltyPercentage);
    if (isNaN(pct) || pct < 0 || pct > 15) {
      addNotification({ type: 'error', title: 'Invalid Percentage', message: 'Royalty must be 0–15%.', duration: 4000 });
      return;
    }
    setActionLoading('royalty');
    try {
      const provider = getProvider();
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(deployedAddress, ['function setDefaultRoyalty(address receiver, uint96 feeNumerator) public'], signer);
      const tx = await contract.setDefaultRoyalty(newRoyaltyReceiver, Math.floor(pct * 100));
      addNotification({ type: 'loading', title: 'Transaction Sent', message: `TX: ${tx.hash.slice(0, 10)}…`, duration: 0 });
      await tx.wait();
      addNotification({ type: 'success', title: 'Royalty Updated', message: `Set to ${pct}% → ${newRoyaltyReceiver.slice(0, 8)}…`, duration: 5000 });
      setNewRoyaltyReceiver(''); setNewRoyaltyPercentage('');
      await fetchContractData();
    } catch (err: any) {
      const msg = err.code === 4001 ? 'Transaction rejected by user.' : (err.message || 'Transaction failed');
      addNotification({ type: 'error', title: 'Royalty Update Failed', message: msg, duration: 6000 });
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateContractURI = async () => {
    if (!deployedAddress || !newContractURI.trim()) return;
    setActionLoading('contractURI');
    try {
      const provider = getProvider();
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(deployedAddress, ['function setContractURI(string memory newContractURI) public'], signer);
      const tx = await contract.setContractURI(newContractURI.trim());
      addNotification({ type: 'loading', title: 'Setting Contract URI…', message: `TX: ${tx.hash.slice(0, 10)}…`, duration: 0 });
      await tx.wait();
      setContractURI(newContractURI.trim()); setNewContractURI('');
      addNotification({ type: 'success', title: 'Contract URI Updated', message: 'Marketplace will auto-populate your collection info.', duration: 5000 });
    } catch (err: any) {
      const msg = err.code === 4001 ? 'Transaction rejected.' : (err.message || 'Failed');
      addNotification({ type: 'error', title: 'Contract URI Failed', message: msg, duration: 6000 });
    } finally {
      setActionLoading(null);
    }
  };

  const handleValidateMetadata = async () => {
    setActionLoading('validate');
    try {
      let uri = revealState.revealed ? revealState.baseURI : revealState.hiddenURI;
      if (!uri) { setMetadataStatus('invalid'); return; }
      if (uri.startsWith('ipfs://')) uri = uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
      if (uri.endsWith('/')) uri += '1';
      const res = await fetch(uri, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const json = await res.json();
        setMetadataStatus(json.name || json.image ? 'valid' : 'invalid');
      } else {
        setMetadataStatus('invalid');
      }
    } catch {
      setMetadataStatus('invalid');
    } finally {
      setActionLoading(null);
    }
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    addNotification({ type: 'success', title: 'Copied', message: label, duration: 2000 });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Marketplace Preparation</h1>
          <p className="text-slate-400">Configure royalties, verify source, and validate metadata for trading on Ebisu's Bay, OpenSea, etc.</p>
        </div>
        <button onClick={fetchContractData} disabled={isLoading} className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors">
          <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Contract info bar */}
      <div className="flex items-center gap-4 p-4 bg-slate-900 rounded-xl border border-slate-800 text-sm">
        <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
        <span className="text-slate-400">Deployed at</span>
        <span className="font-mono text-white">{deployedAddress}</span>
        <button onClick={() => copy(deployedAddress, 'Contract address copied')}><Copy className="w-3.5 h-3.5 text-slate-400 hover:text-white" /></button>
        <a href={`${network.explorerUrl}/address/${deployedAddress}`} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-blue-400 hover:text-blue-300">
          Explorer <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Contract Verification */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/10 rounded-lg"><Shield className="w-5 h-5 text-blue-500" /></div>
            <h3 className="text-lg font-bold text-white">Source Verification</h3>
          </div>
          <p className="text-sm text-slate-400 mb-5">Publish your contract source code on the block explorer. Required by most marketplaces to display collection details.</p>
          <div className="flex items-center justify-between p-4 bg-slate-950 rounded-lg border border-slate-800">
            <div className="flex items-center gap-3">
              {isVerified ? <CheckCircle className="w-5 h-5 text-green-500" /> : <AlertTriangle className="w-5 h-5 text-yellow-500" />}
              <div>
                <p className="text-white font-medium text-sm">{isVerified ? 'Source Verified' : 'Not Verified'}</p>
                <p className="text-xs text-slate-500">{isVerified ? 'Source code is public' : 'Submit to Cronos Explorer'}</p>
              </div>
            </div>
            <button onClick={handleVerifyContract} disabled={isVerified || actionLoading === 'verify'}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors">
              {actionLoading === 'verify' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isVerified ? 'Verified ✓' : actionLoading === 'verify' ? 'Verifying…' : 'Verify Contract'}
            </button>
          </div>
          {isVerified && (
            <a href={`${network.explorerUrl}/address/${deployedAddress}`} target="_blank" rel="noreferrer"
              className="mt-3 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
              View verified source on explorer <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* 2. Royalty Enforcement */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-500/10 rounded-lg"><Coins className="w-5 h-5 text-purple-500" /></div>
            <h3 className="text-lg font-bold text-white">Royalty Enforcement (ERC-2981)</h3>
          </div>
          {royaltyInfo.receiver ? (
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950 rounded-lg border border-slate-800 mb-4 text-sm">
              <div>
                <p className="text-xs text-slate-500 mb-1">Current Receiver</p>
                <div className="flex items-center gap-1">
                  <p className="text-white font-mono text-xs truncate">{royaltyInfo.receiver.slice(0, 10)}…</p>
                  <button onClick={() => copy(royaltyInfo.receiver, 'Receiver address copied')}><Copy className="w-3 h-3 text-slate-500 hover:text-white" /></button>
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Current Fee</p>
                <p className="text-white font-bold">{royaltyInfo.percentage}%</p>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-slate-950 rounded-lg border border-dashed border-slate-700 mb-4 text-center text-xs text-slate-500">No royalty set on-chain yet</div>
          )}
          <div className="flex gap-2">
            <input type="text" placeholder="Receiver address (0x…)" value={newRoyaltyReceiver} onChange={(e) => setNewRoyaltyReceiver(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-purple-500 outline-none" />
            <input type="number" placeholder="%" min={0} max={15} value={newRoyaltyPercentage} onChange={(e) => setNewRoyaltyPercentage(e.target.value)}
              className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-purple-500 outline-none" />
            <button onClick={handleUpdateRoyalty} disabled={actionLoading === 'royalty' || !newRoyaltyReceiver || !newRoyaltyPercentage}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors">
              {actionLoading === 'royalty' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Set
            </button>
          </div>
        </div>

        {/* 3. Metadata State */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-500/10 rounded-lg"><Eye className="w-5 h-5 text-green-500" /></div>
            <h3 className="text-lg font-bold text-white">Metadata & Reveal State</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-sm text-slate-400">Reveal Status</span>
              <span className={`text-xs font-bold px-2 py-1 rounded ${revealState.revealed ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                {revealState.revealed ? '● REVEALED' : '● HIDDEN'}
              </span>
            </div>
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <p className="text-[10px] text-slate-500 mb-1 uppercase">Active URI ({revealState.revealed ? 'Base' : 'Hidden'})</p>
              <p className="text-xs text-white font-mono break-all leading-relaxed">
                {(revealState.revealed ? revealState.baseURI : revealState.hiddenURI) || 'Not Set'}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                {metadataStatus === 'valid' && <><CheckCircle className="w-4 h-4 text-green-500" /><span className="text-green-400">Metadata reachable</span></>}
                {metadataStatus === 'invalid' && <><AlertTriangle className="w-4 h-4 text-red-400" /><span className="text-red-400">Metadata unreachable</span></>}
                {metadataStatus === 'unknown' && <><Search className="w-4 h-4 text-slate-500" /><span className="text-slate-400">Not tested yet</span></>}
              </div>
              <button onClick={handleValidateMetadata} disabled={actionLoading === 'validate'}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors">
                {actionLoading === 'validate' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />} Test URI
              </button>
            </div>
          </div>
        </div>

        {/* 4. Collection Metadata (contractURI) */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-500/10 rounded-lg"><FileJson className="w-5 h-5 text-orange-500" /></div>
            <h3 className="text-lg font-bold text-white">Collection Metadata (contractURI)</h3>
          </div>
          <p className="text-sm text-slate-400 mb-4">Set a contractURI pointing to a JSON with <code className="text-slate-300">name</code>, <code className="text-slate-300">description</code>, <code className="text-slate-300">image</code>, <code className="text-slate-300">fee_recipient</code>. Marketplaces use this to populate your collection page.</p>
          {contractURI && (
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 mb-3">
              <p className="text-[10px] text-slate-500 mb-1 uppercase">Current contractURI</p>
              <div className="flex items-center gap-2">
                <p className="text-xs text-white font-mono break-all flex-1">{contractURI}</p>
                <button onClick={() => copy(contractURI, 'Contract URI copied')}><Copy className="w-3 h-3 text-slate-400 hover:text-white flex-shrink-0" /></button>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <input type="text" placeholder="ipfs://… or https://…" value={newContractURI} onChange={(e) => setNewContractURI(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-orange-500 outline-none font-mono" />
            <button onClick={handleUpdateContractURI} disabled={actionLoading === 'contractURI' || !newContractURI.trim()}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors">
              {actionLoading === 'contractURI' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Set URI
            </button>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">Upload your collection JSON to IPFS first, then paste the CID here.</p>
        </div>
      </div>

      {/* ── Official Marketplaces Hub ──────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-500/10 rounded-lg"><Store className="w-5 h-5 text-blue-400" /></div>
          <div>
            <h3 className="text-lg font-bold text-white">List on Cronos Marketplaces</h3>
            <p className="text-sm text-slate-400">Get your collection listed and trading on official Cronos NFT platforms.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CRONOS_MARKETPLACES.map((mp) => (
            <div key={mp.name} className={`bg-slate-900 rounded-xl border p-5 transition-all hover:border-blue-500/30 ${mp.recommended ? 'border-blue-500/20' : 'border-slate-800'}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{mp.icon}</span>
                  <div>
                    <p className="text-white font-bold text-sm">{mp.name}</p>
                    {mp.recommended && (
                      <span className="text-[9px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded font-bold">Recommended</span>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-3 leading-relaxed">{mp.description}</p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {mp.features.map((f) => (
                  <span key={f} className="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full">{f}</span>
                ))}
              </div>
              <div className="flex gap-2">
                <a href={mp.url} target="_blank" rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors">
                  <Globe className="w-3.5 h-3.5" /> Visit
                </a>
                {deployedAddress && (
                  <a href={mp.listUrl(deployedAddress)} target="_blank" rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" /> View Collection
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Cronos Explorer Link ──────────────────────────────────────────────── */}
      <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 flex items-center gap-4">
        <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
          <Globe className="w-5 h-5 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm">Cronos Official Explorer</p>
          <p className="text-xs text-slate-400 mt-0.5">View your contract, transactions and NFT transfers on the official explorer.</p>
        </div>
        <a href={deployedAddress ? `${network.explorerUrl}/address/${deployedAddress}` : network.explorerUrl}
          target="_blank" rel="noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold whitespace-nowrap transition-colors flex-shrink-0">
          Open Explorer <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
export default MarketplacePrep;
