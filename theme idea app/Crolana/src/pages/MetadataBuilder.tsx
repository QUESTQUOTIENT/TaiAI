import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { Download, RefreshCw, CheckCircle, AlertTriangle, Settings, Eye, EyeOff, Upload, ExternalLink, Loader2 } from 'lucide-react';
import JSZip from 'jszip';

export function MetadataBuilder() {
  const {
    collectionMetadata,
    updateCollectionMetadata,
    generatedCollection,
    tokenMetadata,
    setTokenMetadata,
    validateMetadata,
    validationResult,
    addNotification,
    advancedContractConfig,
    updateAdvancedContractConfig,
    ipfsCid,
  } = useAppStore();

  const [isExporting, setIsExporting] = useState(false);
  const [previewToken, setPreviewToken] = useState<any>(null);

  
  useEffect(() => {
    if (generatedCollection.length > 0 && tokenMetadata.length !== generatedCollection.length) {
      const initial = generatedCollection.map((nft, index) => ({
        id: index.toString(),
        name: nft.name,
        description: nft.description || collectionMetadata.description,
        image: ipfsCid ? `ipfs://${ipfsCid}/${index + 1}.png` : nft.image,
        attributes: nft.attributes,
        external_url: collectionMetadata.external_url,
      }));
      setTokenMetadata(initial);
    }
  }, [generatedCollection, ipfsCid]);

  
  useEffect(() => {
    if (ipfsCid && tokenMetadata.length > 0) {
      const updated = tokenMetadata.map((t, i) => ({
        ...t,
        image: `ipfs://${ipfsCid}/${i + 1}.png`,
      }));
      setTokenMetadata(updated);
    }
  }, [ipfsCid]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => updateCollectionMetadata({ image: reader.result as string });
      reader.readAsDataURL(file);
    }
  };

  const handleExport = async () => {
    if (tokenMetadata.length === 0 && generatedCollection.length === 0) {
      addNotification({ type: 'error', title: 'Nothing to Export', message: 'Generate your collection first in Asset Creation.', duration: 4000 });
      return;
    }
    setIsExporting(true);
    try {
      const zip = new JSZip();
      const metaFolder = zip.folder('metadata')!;

      
      zip.file('collection.json', JSON.stringify({
        name: collectionMetadata.name,
        description: collectionMetadata.description,
        image: collectionMetadata.image || (ipfsCid ? `ipfs://${ipfsCid}/banner.png` : ''),
        external_link: collectionMetadata.external_url,
        seller_fee_basis_points: Math.round((collectionMetadata.royalty_percentage || 0) * 100),
        fee_recipient: collectionMetadata.royalty_recipient || '',
      }, null, 2));

      
      const items = tokenMetadata.length > 0 ? tokenMetadata : generatedCollection.map((nft, i) => ({
        id: i.toString(), name: nft.name, description: nft.description || collectionMetadata.description,
        image: ipfsCid ? `ipfs://${ipfsCid}/${i + 1}.png` : 'ipfs://REPLACE_WITH_IMAGES_CID/1.png',
        attributes: nft.attributes, external_url: collectionMetadata.external_url,
      }));

      items.forEach((token, i) => {
        metaFolder.file(`${i + 1}.json`, JSON.stringify({
          name: token.name,
          description: token.description || collectionMetadata.description,
          image: token.image,
          external_url: token.external_url || collectionMetadata.external_url || '',
          attributes: token.attributes,
        }, null, 2));
      });

      
      if (!advancedContractConfig.advanced.isRevealed) {
        zip.file('hidden.json', JSON.stringify({
          name: 'Mystery Box',
          description: `${collectionMetadata.name} — unrevealed`,
          image: 'ipfs://REPLACE_WITH_HIDDEN_IMAGE_CID',
        }, null, 2));
      }

      zip.file('README.txt', [
        `Collection: ${collectionMetadata.name}`,
        `Tokens: ${items.length}`,
        '',
        'STEPS:',
        '1. Upload the metadata/ folder to IPFS',
        '2. Copy the resulting CID',
        '3. Set it as your contract Base URI: ipfs://YOUR_CID/',
        '',
        ipfsCid ? `Images already pinned at: ipfs://${ipfsCid}/` : 'Remember to upload images to IPFS first and update image URLs.',
        '',
        'collection.json → upload this to IPFS and set as contractURI for marketplace metadata',
        !advancedContractConfig.advanced.isRevealed ? 'hidden.json → upload this to IPFS and set as hiddenMetadataUri' : '',
      ].filter(Boolean).join('\n'));

      const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(collectionMetadata.name || 'collection').replace(/\s+/g, '_')}_metadata.zip`;
      a.click();
      URL.revokeObjectURL(url);
      addNotification({ type: 'success', title: 'Exported!', message: `${items.length} token JSON files + collection.json`, duration: 4000 });
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Export Failed', message: err.message, duration: 5000 });
    } finally {
      setIsExporting(false);
    }
  };

  const runValidation = () => {
    validateMetadata();
    const { errors, warnings } = validationResult;
    if (errors.length === 0 && warnings.length === 0) {
      addNotification({ type: 'success', title: 'Validation Passed', message: 'Metadata looks good!', duration: 3000 });
    }
  };

  const totalTokens = tokenMetadata.length || generatedCollection.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Metadata Builder</h1>
          <p className="text-slate-400">Configure collection details and export standards-compliant JSON metadata.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={runValidation} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors text-sm">
            <CheckCircle className="w-4 h-4" /> Validate
          </button>
          <button onClick={handleExport} disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-bold transition-colors text-sm">
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export ZIP
          </button>
        </div>
      </div>

      {}
      {ipfsCid && (
        <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-sm">
          <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
          <span className="text-green-400 font-medium">Images pinned at</span>
          <code className="text-green-300/80 font-mono text-xs flex-1 truncate">ipfs:
            <span className="text-green-400/60 text-xs flex-shrink-0">Metadata will reference this CID</span>
          </code>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {}
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-950/50">
            <h2 className="font-bold text-white flex items-center gap-2"><Settings className="w-4 h-4 text-slate-400" /> Collection Settings</h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Collection Name *</label>
                <input value={collectionMetadata.name} onChange={(e) => updateCollectionMetadata({ name: e.target.value })}
                  placeholder="Cyber Apes" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Symbol</label>
                <input value={collectionMetadata.symbol} onChange={(e) => updateCollectionMetadata({ symbol: e.target.value })}
                  placeholder="CYAP" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Description *</label>
              <textarea value={collectionMetadata.description} onChange={(e) => updateCollectionMetadata({ description: e.target.value })}
                placeholder="A unique generative collection on Cronos…" rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none resize-none" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">External URL</label>
              <input value={collectionMetadata.external_url} onChange={(e) => updateCollectionMetadata({ external_url: e.target.value })}
                placeholder="https://yourproject.com" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Royalty %</label>
                <input type="number" min={0} max={15} step={0.5} value={collectionMetadata.royalty_percentage}
                  onChange={(e) => updateCollectionMetadata({ royalty_percentage: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Royalty Recipient</label>
                <input value={collectionMetadata.royalty_recipient} onChange={(e) => updateCollectionMetadata({ royalty_recipient: e.target.value })}
                  placeholder="0x…" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none font-mono text-xs" />
              </div>
            </div>
            {}
            <div>
              <label className="block text-xs text-slate-400 mb-2">Collection Banner / Logo</label>
              {collectionMetadata.image ? (
                <div className="flex items-center gap-3">
                  <img src={collectionMetadata.image} alt="Collection" className="w-14 h-14 rounded-lg object-cover border border-slate-700" />
                  <div className="flex-1">
                    <p className="text-xs text-slate-300 truncate">{collectionMetadata.image.startsWith('blob:') ? 'Local file' : collectionMetadata.image}</p>
                    <button onClick={() => updateCollectionMetadata({ image: '' })} className="text-xs text-red-400 hover:text-red-300 mt-1">Remove</button>
                  </div>
                </div>
              ) : (
                <label className="flex items-center gap-3 p-4 bg-slate-950 border border-dashed border-slate-700 hover:border-blue-500 rounded-xl cursor-pointer transition-colors">
                  <Upload className="w-5 h-5 text-slate-500" />
                  <span className="text-sm text-slate-500">Upload banner image</span>
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </label>
              )}
            </div>
          </div>
        </div>

        {}
        <div className="space-y-4">
          {}
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 bg-slate-950/50">
              <h2 className="font-bold text-white flex items-center gap-2">
                {advancedContractConfig.advanced.isRevealed ? <Eye className="w-4 h-4 text-green-400" /> : <EyeOff className="w-4 h-4 text-yellow-400" />}
                Reveal Configuration
              </h2>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
                <div>
                  <p className="text-sm text-white font-medium">Reveal on Deploy</p>
                  <p className="text-xs text-slate-500 mt-0.5">{advancedContractConfig.advanced.isRevealed ? 'Tokens show real metadata immediately' : 'Tokens show hidden placeholder until you call reveal()'}</p>
                </div>
                <button onClick={() => updateAdvancedContractConfig({ advanced: { ...advancedContractConfig.advanced, isRevealed: !advancedContractConfig.advanced.isRevealed } })}
                  className={`w-11 h-6 rounded-full transition-colors relative ${advancedContractConfig.advanced.isRevealed ? 'bg-green-500' : 'bg-slate-700'}`}>
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${advancedContractConfig.advanced.isRevealed ? 'left-[22px]' : 'left-1'}`} />
                </button>
              </div>
              {!advancedContractConfig.advanced.isRevealed && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Hidden Metadata URI</label>
                    <input value={advancedContractConfig.advanced.hiddenURI || ''}
                      onChange={(e) => updateAdvancedContractConfig({ advanced: { ...advancedContractConfig.advanced, hiddenURI: e.target.value } })}
                      placeholder="ipfs://... (single JSON for all hidden tokens)"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-yellow-500 outline-none font-mono" />
                    <p className="text-[10px] text-slate-500 mt-1">Upload hidden.json to IPFS first, then paste the full URI here.</p>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Base URI {ipfsCid && <span className="text-green-400">(auto-filled)</span>}</label>
                <input value={advancedContractConfig.advanced.baseURI || ''}
                  onChange={(e) => updateAdvancedContractConfig({ advanced: { ...advancedContractConfig.advanced, baseURI: e.target.value } })}
                  placeholder="ipfs://YOUR_METADATA_CID/"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-blue-500 outline-none font-mono" />
                <p className="text-[10px] text-slate-500 mt-1">Must end with /. Tokens will return {'{baseURI}{tokenId}.json'}.</p>
              </div>
            </div>
          </div>

          {}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">Token Summary</h3>
              <span className="text-sm font-bold text-blue-400">{totalTokens} tokens</span>
            </div>
            {totalTokens === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-slate-800 rounded-xl">
                <p className="text-slate-500 text-sm">No tokens yet.</p>
                <a href="/assets" className="text-blue-400 text-xs hover:text-blue-300 mt-1 flex items-center justify-center gap-1">Generate in Asset Creation <ExternalLink className="w-3 h-3" /></a>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-5 gap-2 mb-3">
                  {(tokenMetadata.length > 0 ? tokenMetadata : generatedCollection.map((n, i) => ({ ...n, id: i.toString() }))).slice(0, 10).map((token, i) => (
                    <div key={i} className="aspect-square rounded-lg overflow-hidden border border-slate-800 cursor-pointer hover:border-blue-500 transition-colors"
                      onClick={() => setPreviewToken(token)}>
                      <img src={(token as any).image} alt={token.name} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
                {totalTokens > 10 && <p className="text-xs text-slate-500 text-center">+{totalTokens - 10} more tokens</p>}
              </div>
            )}
          </div>

          {}
          {(validationResult.errors.length > 0 || validationResult.warnings.length > 0) && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-3">
              <h3 className="font-bold text-white text-sm">Validation Results</h3>
              {validationResult.errors.map((e, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                  <span className="text-red-300">{e}</span>
                </div>
              ))}
              {validationResult.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <span className="text-yellow-300">{w}</span>
                </div>
              ))}
              {validationResult.isValid && <div className="flex items-center gap-2 text-xs text-green-400"><CheckCircle className="w-3.5 h-3.5" /> All checks passed</div>}
            </div>
          )}
        </div>
      </div>

      {}
      {previewToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setPreviewToken(null)}>
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="aspect-square rounded-xl overflow-hidden mb-4 border border-slate-800">
              <img src={previewToken.image} alt={previewToken.name} className="w-full h-full object-cover" />
            </div>
            <h3 className="font-bold text-white text-lg mb-1">{previewToken.name}</h3>
            <p className="text-slate-400 text-sm mb-3">{previewToken.description}</p>
            <div className="flex flex-wrap gap-1.5">
              {previewToken.attributes?.map((a: any, i: number) => (
                <div key={i} className="px-2 py-1 bg-slate-800 rounded-lg text-xs">
                  <span className="text-slate-500">{a.trait_type}: </span>
                  <span className="text-white">{String(a.value)}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-600 font-mono mt-3 break-all">{previewToken.image?.startsWith('ipfs://') ? previewToken.image : '(local preview — will be IPFS URI after upload)'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
export default MetadataBuilder;
