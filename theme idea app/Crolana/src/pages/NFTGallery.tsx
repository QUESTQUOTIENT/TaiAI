
import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import { isSolanaNetwork } from '../types';
import { getChainAdapter } from '../lib/chainAdapter';
import { parseChainError } from '../lib/chainErrors';
import type { UnifiedNFT } from '../lib/unifiedNFT';
import {
  Grid, List, RefreshCw, ExternalLink, Search, Filter, X,
  ChevronLeft, ChevronRight, Image as ImageIcon, AlertTriangle,
  ZoomIn, Copy, Hash, User, Layers, Tag, Globe, Zap,
} from 'lucide-react';
import { cn } from '../lib/utils';



type ViewMode = 'grid' | 'list';
type ChainTab = 'cronos' | 'solana';



function NFTCard({ nft, onClick, chain }: { nft: UnifiedNFT; onClick: () => void; chain: ChainTab }) {
  const [imgErr, setImgErr] = useState(false);
  const isSolana = chain === 'solana';
  return (
    <div onClick={onClick}
      className="group bg-slate-900 rounded-xl border border-slate-800 hover:border-blue-500/40 overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:shadow-blue-900/20 hover:-translate-y-0.5">
      <div className="aspect-square bg-slate-950 flex items-center justify-center relative overflow-hidden">
        {!imgErr && nft.image ? (
          <img src={nft.image} alt={nft.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgErr(true)} />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-700">
            <ImageIcon className="w-10 h-10" />
            <span className="text-xs">No Image</span>
          </div>
        )}
        <div className="absolute top-2 left-2">
          <span className={cn('px-1.5 py-0.5 text-[9px] font-bold rounded uppercase',
            isSolana ? 'bg-purple-500/80 text-white' : 'bg-blue-500/80 text-white')}>
            {isSolana ? '◎ SOL' : '⛓ CRO'}
          </span>
        </div>
        {nft.isListed && (
          <div className="absolute top-2 right-2 bg-green-500/80 backdrop-blur-sm text-white text-[9px] font-bold px-2 py-1 rounded-lg">
            Listed
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
      <div className="p-3">
        <p className="text-white font-bold text-sm truncate">{nft.name}</p>
        {nft.attributes?.length > 0 && (
          <p className="text-slate-500 text-xs mt-0.5">{nft.attributes.length} traits</p>
        )}
        {nft.rarityLabel && (
          <span className={cn('inline-block mt-1 px-1.5 py-0.5 text-[9px] font-bold rounded uppercase', {
            'bg-yellow-500/20 text-yellow-400': nft.rarityLabel === 'legendary' || nft.rarityLabel === 'mythic',
            'bg-purple-500/20 text-purple-400': nft.rarityLabel === 'epic',
            'bg-blue-500/20 text-blue-400':     nft.rarityLabel === 'rare',
            'bg-slate-700/60 text-slate-400':   nft.rarityLabel === 'common' || nft.rarityLabel === 'uncommon',
          })}>
            {nft.rarityLabel}
          </span>
        )}
        <p className="text-slate-600 font-mono text-[10px] mt-1 truncate">{nft.owner?.slice(0, 8)}…</p>
      </div>
    </div>
  );
}

function NFTDetailModal({ nft, onClose, chain }: { nft: UnifiedNFT; onClose: () => void; chain: ChainTab }) {
  const [imgErr, setImgErr] = useState(false);
  const copy = (t: string) => navigator.clipboard.writeText(t);
  const explorerBase = chain === 'solana' ? 'https://solscan.io' : 'https://explorer.cronos.org';
  const explorerLink = chain === 'solana'
    ? `${explorerBase}/token/${nft.mintAddress}`
    : `${explorerBase}/token/${nft.contractAddress}?a=${nft.tokenId}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg z-10">
          <X className="w-5 h-5" />
        </button>
        <div className="flex flex-col sm:flex-row">
          <div className="sm:w-72 flex-shrink-0 bg-slate-950 rounded-tl-2xl sm:rounded-bl-2xl rounded-tr-2xl sm:rounded-tr-none flex items-center justify-center p-4 aspect-square sm:aspect-auto min-h-64">
            {!imgErr && nft.image ? (
              <img src={nft.image} alt={nft.name} className="w-full h-full object-cover rounded-xl" onError={() => setImgErr(true)} />
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-700">
                <ImageIcon className="w-16 h-16" /><span className="text-sm">No Image</span>
              </div>
            )}
          </div>
          <div className="flex-1 p-5 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={cn('px-2 py-0.5 text-[10px] font-bold rounded uppercase',
                  chain === 'solana' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400')}>
                  {chain === 'solana' ? '◎ Solana' : '⛓ Cronos'}
                </span>
                {nft.standard && <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-800 text-slate-400 uppercase">{nft.standard}</span>}
              </div>
              <h2 className="text-xl font-black text-white">{nft.name}</h2>
              {nft.description && <p className="text-slate-400 text-sm mt-1 leading-relaxed">{nft.description}</p>}
            </div>

            {}
            <div className="flex items-center gap-2 p-3 bg-slate-950 rounded-lg border border-slate-800">
              <Hash className="w-4 h-4 text-slate-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-slate-500">{chain === 'solana' ? 'Mint Address' : `Contract · Token #${nft.tokenId}`}</p>
                <p className="text-white font-mono text-xs truncate">
                  {chain === 'solana' ? nft.mintAddress : nft.contractAddress}
                </p>
              </div>
              <button onClick={() => copy((chain === 'solana' ? nft.mintAddress : nft.contractAddress) ?? '')} title="Copy">
                <Copy className="w-3.5 h-3.5 text-slate-500 hover:text-white" />
              </button>
            </div>

            {}
            {nft.owner && (
              <div className="flex items-center gap-2 p-3 bg-slate-950 rounded-lg border border-slate-800">
                <User className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-500">Owner</p>
                  <p className="text-white font-mono text-xs truncate">{nft.owner}</p>
                </div>
                <button onClick={() => copy(nft.owner)}><Copy className="w-3.5 h-3.5 text-slate-500 hover:text-white" /></button>
              </div>
            )}

            {}
            {nft.royaltyBps !== undefined && (
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-950 rounded-lg border border-slate-800">
                <Zap className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
                <p className="text-[11px] text-slate-400">Royalty: <span className="text-white font-bold">{nft.royaltyBps / 100}%</span></p>
              </div>
            )}

            {}
            {nft.attributes?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" /> Traits
                </p>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {nft.attributes.map((attr, i) => (
                    <div key={i} className="p-2.5 bg-blue-600/8 border border-blue-500/20 rounded-lg">
                      <p className="text-[10px] text-blue-400 uppercase tracking-wider font-bold truncate">{attr.trait_type}</p>
                      <p className="text-white text-sm font-semibold truncate mt-0.5">{String(attr.value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <a href={explorerLink} target="_blank" rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> Explorer
              </a>
              {nft.metadataUri && (
                <a href={nft.metadataUri.startsWith('ipfs://')
                    ? nft.metadataUri.replace('ipfs://', 'https://ipfs.io/ipfs/')
                    : nft.metadataUri}
                  target="_blank" rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors">
                  <Globe className="w-3.5 h-3.5" /> Metadata
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



export function NFTGallery() {
  const { walletAddress, solanaWalletAddress, network, deployedAddress, addNotification } = useAppStore();

  const isSolana  = isSolanaNetwork(network);
  const activeTab: ChainTab = isSolana ? 'solana' : 'cronos';

  const [chainTab, setChainTab] = useState<ChainTab>(activeTab);
  const [nfts, setNfts]         = useState<UnifiedNFT[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [error, setError]       = useState<{ title: string; message: string; isRetryable: boolean } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedNFT, setSelectedNFT] = useState<UnifiedNFT | null>(null);
  const [searchTerm, setSearchTerm]   = useState('');
  const [filterOwner, setFilterOwner] = useState(false);
  const [source, setSource]           = useState<string>('');

  
  const [contractAddr, setContractAddr] = useState(deployedAddress ?? '');

  const activeWallet = chainTab === 'solana' ? solanaWalletAddress : walletAddress;

  

  const loadNFTs = useCallback(async (forceRefresh = false) => {
    if (!activeWallet) { setNfts([]); return; }
    setLoading(true); setError(null);

    try {
      
      const qs = new URLSearchParams({
        wallet: activeWallet,
        ...(forceRefresh && { forceRefresh: 'true' }),
        ...(chainTab === 'cronos' && contractAddr && { contract: contractAddr }),
      });
      const res = await fetch(`/api/${chainTab}/nfts?${qs}`);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const json = await res.json();
      setNfts(json.nfts ?? []);
      setSource(json.source ?? '');

      if (forceRefresh) {
        addNotification({ type: 'success', title: 'Gallery Refreshed', message: `${json.nfts?.length ?? 0} NFTs loaded from ${json.source}`, duration: 3000 });
      }
    } catch (err: any) {
      const parsed = parseChainError(err, chainTab);
      setError({ title: parsed.title, message: parsed.message, isRetryable: parsed.isRetryable });
      addNotification({ type: 'error', title: parsed.title, message: parsed.message, duration: 5000 });
    } finally {
      setLoading(false);
    }
  }, [activeWallet, chainTab, contractAddr, addNotification]);

  useEffect(() => { loadNFTs(); }, [activeWallet, chainTab]);

  
  useEffect(() => { setChainTab(activeTab); }, [activeTab]);

  

  const filtered = nfts.filter(n => {
    if (filterOwner && activeWallet && n.owner?.toLowerCase() !== activeWallet.toLowerCase()) return false;
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      return (
        n.name.toLowerCase().includes(t) ||
        (n.tokenId && String(n.tokenId).includes(t)) ||
        (n.mintAddress && n.mintAddress.toLowerCase().includes(t)) ||
        n.attributes?.some(a => String(a.value).toLowerCase().includes(t) || a.trait_type.toLowerCase().includes(t))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            <span className="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl flex items-center justify-center">
              <Layers className="w-5 h-5 text-white" />
            </span>
            NFT Gallery
          </h1>
          <p className="text-slate-400 text-sm mt-1">Your NFTs across Cronos and Solana.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setViewMode('grid')} className={cn('p-2 rounded-lg transition-colors', viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white')}>
            <Grid className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode('list')} className={cn('p-2 rounded-lg transition-colors', viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white')}>
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {}
      <div className="flex gap-2">
        {(['cronos', 'solana'] as ChainTab[]).map(tab => (
          <button key={tab} onClick={() => setChainTab(tab)}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border',
              chainTab === tab
                ? tab === 'solana' ? 'bg-purple-600 text-white border-transparent' : 'bg-blue-600 text-white border-transparent'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white')}>
            {tab === 'solana' ? <>◎ Solana {solanaWalletAddress ? <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" /> : null}</>
              : <>⛓ Cronos {walletAddress ? <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" /> : null}</>}
          </button>
        ))}
      </div>

      {}
      {chainTab === 'cronos' && (
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Filter by Contract (optional)</label>
              <input value={contractAddr} onChange={e => setContractAddr(e.target.value)}
                placeholder="0x… contract address or leave blank for all wallet NFTs"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white text-sm font-mono focus:border-blue-500 outline-none" />
            </div>
            <div className="flex items-end">
              <button onClick={() => loadNFTs(true)} disabled={isLoading}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm transition-colors">
                <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
              </button>
            </div>
          </div>
        </div>
      )}

      {}
      {!activeWallet && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Layers className="w-16 h-16 text-slate-700 mb-4" />
          <p className="text-slate-400 font-semibold">No wallet connected</p>
          <p className="text-slate-600 text-sm mt-1">
            Connect your {chainTab === 'solana' ? 'Phantom' : 'MetaMask'} wallet to view your NFTs.
          </p>
        </div>
      )}

      {}
      {!isLoading && activeWallet && nfts.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="flex-1">
            <span className="text-white font-semibold text-sm">{nfts.length} NFTs</span>
            <span className="text-slate-500 text-xs ml-2">in wallet</span>
          </div>
          {source && (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-800 text-slate-400 uppercase">{source}</span>
          )}
          <button onClick={() => loadNFTs(true)} disabled={isLoading} title="Force refresh"
            className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
          </button>
        </div>
      )}

      {}
      {nfts.length > 0 && (
        <div className="flex gap-3 items-center">
          <div className="relative flex-1 max-w-64">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by name, ID, trait…"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-blue-500 outline-none" />
          </div>
          {activeWallet && (
            <button onClick={() => setFilterOwner(!filterOwner)}
              className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors',
                filterOwner ? 'bg-blue-600/20 border-blue-500/40 text-blue-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white')}>
              <Filter className="w-3.5 h-3.5" /> My NFTs
            </button>
          )}
          <span className="text-xs text-slate-500">{filtered.length} shown</span>
        </div>
      )}

      {}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-3" />
          <p className="text-slate-400 text-sm">
            Loading NFTs from {chainTab === 'solana' ? 'Helius DAS' : 'Covalent'}…
          </p>
        </div>
      )}

      {}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-400 font-semibold text-sm">{error.title}</p>
            <p className="text-red-400/70 text-xs mt-0.5">{error.message}</p>
          </div>
          {error.isRetryable && (
            <button onClick={() => loadNFTs(true)}
              className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-xs font-bold transition-colors">
              Retry
            </button>
          )}
        </div>
      )}

      {}
      {!isLoading && !error && activeWallet && nfts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ImageIcon className="w-16 h-16 text-slate-700 mb-4" />
          <p className="text-slate-400 font-semibold">No NFTs found</p>
          <p className="text-slate-600 text-sm mt-1">
            This wallet has no NFTs on {chainTab === 'solana' ? 'Solana' : 'Cronos'}.
          </p>
        </div>
      )}

      {}
      {!isLoading && filtered.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map(n => (
            <NFTCard key={n.id} nft={n} chain={chainTab} onClick={() => setSelectedNFT(n)} />
          ))}
        </div>
      )}

      {}
      {!isLoading && filtered.length > 0 && viewMode === 'list' && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 text-xs">
                <th className="px-4 py-3 text-left">NFT</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">Chain</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">Traits</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Owner</th>
                <th className="px-4 py-3 text-right">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filtered.map(n => (
                <tr key={n.id} className="hover:bg-slate-800/20 cursor-pointer transition-colors" onClick={() => setSelectedNFT(n)}>
                  <td className="px-4 py-3">
                    <div className="w-10 h-10 bg-slate-950 rounded-lg overflow-hidden flex-shrink-0">
                      {n.image
                        ? <img src={n.image} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        : <ImageIcon className="w-full h-full p-2 text-slate-700" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-300 truncate max-w-32">{n.name}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={cn('px-1.5 py-0.5 text-[9px] font-bold rounded uppercase',
                      chainTab === 'solana' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400')}>
                      {chainTab}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{n.attributes?.length ?? 0}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs hidden md:table-cell truncate max-w-24">{n.owner?.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-blue-400 hover:text-blue-300" onClick={e => { e.stopPropagation(); setSelectedNFT(n); }}>
                      <ExternalLink className="w-4 h-4 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {}
      {selectedNFT && (
        <NFTDetailModal nft={selectedNFT} chain={chainTab} onClose={() => setSelectedNFT(null)} />
      )}
    </div>
  );
}
export default NFTGallery;
