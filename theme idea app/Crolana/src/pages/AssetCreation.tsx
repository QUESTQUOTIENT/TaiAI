import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { X, Layers, Image as ImageIcon, Trash2, Plus, Wand2, Loader2, GripVertical, Crown, Download, ArrowRight } from 'lucide-react';
import { useAppStore } from '../store';
import { TraitImage, GeneratedNFT } from '../types';
import { v4 as uuidv4 } from 'uuid';
import JSZip from 'jszip';

export function AssetCreation() {
  const {
    layers, addLayer, removeLayer, updateLayerName, addTraitsToLayer, removeTraitFromLayer,
    collectionMetadata, updateCollectionMetadata,
    contractConfig, updateContractConfig,
    setGeneratedCollection, generatedCollection, removeGeneratedNFT,
    legendaries, addLegendaries, removeLegendary,
    addNotification, updateNotification,
  } = useAppStore();

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'generate' | 'gallery'>('generate');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  
  const handleLegendaryDrop = useCallback(async (acceptedFiles: File[]) => {
    const newLegendaries = await Promise.all(
      acceptedFiles.map(async (file) => {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        return {
          id: `legendary-${uuidv4()}`,
          name: file.name.split('.')[0],
          description: collectionMetadata.description,
          image: dataUrl,
          attributes: [{ trait_type: 'Rarity', value: 'Legendary' }],
          isLegendary: true,
          file,
        };
      })
    );

    addLegendaries(newLegendaries);
    addNotification({
      type: 'success',
      title: 'Legendaries Added',
      message: `${acceptedFiles.length} legendary NFTs added.`,
      duration: 3000,
    });
  }, [collectionMetadata.description, addLegendaries, addNotification]);

  const { getRootProps: getLegendaryRootProps, getInputProps: getLegendaryInputProps, isDragActive: isLegendaryDragActive } = useDropzone({
    onDrop: handleLegendaryDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'] },
  });

  
  const handleTraitDrop = useCallback((acceptedFiles: File[], layerId: string) => {
    const newTraits: TraitImage[] = acceptedFiles.map((file) => {
      const nameParts = file.name.split('.')[0].split('#');
      const name = nameParts[0].trim();
      const weight = nameParts.length > 1 ? parseInt(nameParts[1]) : 10;
      return { id: uuidv4(), file, name, weight: isNaN(weight) ? 10 : weight, previewUrl: URL.createObjectURL(file) };
    });
    addTraitsToLayer(layerId, newTraits);
    if (newTraits.length > 0) addNotification({ type: 'success', title: 'Traits Added', message: `${newTraits.length} traits added to layer.`, duration: 2000 });
  }, [addTraitsToLayer, addNotification]);

  
  const generateCollection = async () => {
    const activeLayers = layers.filter((l) => l.traits.length > 0);
    if (activeLayers.length === 0) {
      addNotification({ type: 'error', title: 'No Traits', message: 'Add at least one layer with traits before generating.', duration: 4000 });
      return;
    }
    setIsGenerating(true);
    const notifId = addNotification({ type: 'loading', title: 'Generating Collection', message: 'Running generative algorithm…', duration: 0 });

    setTimeout(async () => {
      try {
        const newCollection: GeneratedNFT[] = [];
        const generatedHashes = new Set<string>();
        const totalToGenerate = Math.max(0, contractConfig.maxSupply - legendaries.length);
        const seedRandom = (seed: number) => { const x = Math.sin(seed) * 10000; return x - Math.floor(x); };

        let attempts = 0;
        const maxAttempts = totalToGenerate * 20;

        for (let i = 0; i < totalToGenerate; i++) {
          if (attempts >= maxAttempts) throw new Error('Could not generate enough unique NFTs. Add more trait variations.');

          const attributes: { trait_type: string; value: string }[] = [];
          const layerImages: HTMLImageElement[] = [];
          let hashString = '';

          for (let lIndex = 0; lIndex < layers.length; lIndex++) {
            const layer = layers[lIndex];
            if (layer.traits.length === 0) continue;
            const totalWeight = layer.traits.reduce((sum, t) => sum + t.weight, 0);
            let random = seedRandom(i * 1000 + attempts * 100 + lIndex) * totalWeight;
            let selectedTrait = layer.traits[0];
            for (const trait of layer.traits) { random -= trait.weight; if (random <= 0) { selectedTrait = trait; break; } }

            attributes.push({ trait_type: layer.name, value: selectedTrait.name });
            hashString += `${layer.id}:${selectedTrait.id}|`;

            const img = new Image();
            img.src = selectedTrait.previewUrl;
            await new Promise((res) => { img.onload = res; img.onerror = res; });
            layerImages.push(img);
          }

          if (generatedHashes.has(hashString)) { i--; attempts++; continue; }
          generatedHashes.add(hashString);

          const canvas = document.createElement('canvas');
          if (layerImages.length > 0) {
            canvas.width = layerImages[0].naturalWidth || 512;
            canvas.height = layerImages[0].naturalHeight || 512;
            const ctx = canvas.getContext('2d');
            if (ctx) layerImages.forEach((img) => ctx.drawImage(img, 0, 0, canvas.width, canvas.height));
          }

          newCollection.push({
            id: i.toString(),
            name: `${collectionMetadata.name || 'NFT'} #${i + 1}`,
            description: collectionMetadata.description,
            image: canvas.toDataURL('image/png'),
            attributes,
          });
        }

        const fullCollection = [...newCollection, ...legendaries];
        setGeneratedCollection(fullCollection);
        updateNotification(notifId, { type: 'success', title: 'Generation Complete', message: `Generated ${fullCollection.length} NFTs. Check the Gallery tab.`, duration: 4000 });
        setActiveTab('gallery');
      } catch (error: any) {
        updateNotification(notifId, { type: 'error', title: 'Generation Failed', message: error.message, duration: 6000 });
      } finally {
        setIsGenerating(false);
      }
    }, 50);
  };

  
  const downloadCollection = async () => {
    if (generatedCollection.length === 0) return;
    setIsZipping(true);
    const notifId = addNotification({ type: 'loading', title: 'Preparing Download', message: 'Zipping collection…', duration: 0 });
    try {
      const zip = new JSZip();
      const imagesFolder = zip.folder('images')!;
      const metadataFolder = zip.folder('metadata')!;

      for (let i = 0; i < generatedCollection.length; i++) {
        const nft = generatedCollection[i];
        const imgName = `${String(i + 1).padStart(4, '0')}.png`;
        if (nft.file) {
          imagesFolder.file(imgName, nft.file);
        } else {
          const blob = await (await fetch(nft.image)).blob();
          imagesFolder.file(imgName, blob);
        }
        metadataFolder.file(`${String(i + 1).padStart(4, '0')}.json`, JSON.stringify({
          name: nft.name,
          description: nft.description || collectionMetadata.description,
          image: `ipfs://REPLACE_WITH_YOUR_IMAGES_CID/${imgName}`,
          attributes: nft.attributes,
        }, null, 2));
      }

      zip.file('README.txt', [
        `Collection: ${collectionMetadata.name || 'Untitled'}`,
        `Total: ${generatedCollection.length} NFTs`,
        '',
        'NEXT STEPS:',
        '1. Upload the images/ folder to IPFS via Lighthouse or Pinata',
        '2. Copy the resulting images CID',
        '3. Replace REPLACE_WITH_YOUR_IMAGES_CID in all metadata/ JSON files with the real CID',
        '4. Upload the metadata/ folder to IPFS',
        '5. Copy the metadata CID → use as Base URI: ipfs://<metadata_CID>/',
        '6. Go to Contract page in Crolana and paste the Base URI',
      ].join('\n'));

      const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(collectionMetadata.name || 'collection').replace(/\s+/g, '_')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      updateNotification(notifId, { type: 'success', title: 'Download Ready', message: `${generatedCollection.length} images + metadata JSON files.`, duration: 4000 });
    } catch (error: any) {
      updateNotification(notifId, { type: 'error', title: 'Download Failed', message: error.message, duration: 5000 });
    } finally {
      setIsZipping(false);
    }
  };

  const downloadSingleNFT = (nft: GeneratedNFT) => {
    const a = document.createElement('a');
    a.href = nft.image;
    a.download = `${nft.name.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const calculateRarity = (nft: GeneratedNFT): string => {
    if (nft.isLegendary) return '★ Legendary';
    let probability = 1;
    nft.attributes.forEach((attr) => {
      const layer = layers.find((l) => l.name === attr.trait_type);
      if (layer) {
        const totalW = layer.traits.reduce((s, t) => s + t.weight, 0);
        const trait = layer.traits.find((t) => t.name === attr.value);
        if (trait && totalW > 0) probability *= trait.weight / totalW;
      }
    });
    return `${(probability * 100).toFixed(3)}%`;
  };

  const filteredCollection = generatedCollection.filter((nft) => {
    const q = searchQuery.toLowerCase();
    return nft.name.toLowerCase().includes(q) || nft.attributes.some((a) => String(a.value).toLowerCase().includes(q) || a.trait_type.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">NFT Engine</h1>
        <p className="text-slate-400 text-sm">Upload trait layers, set rarity weights, generate your collection, then download the ZIP for IPFS upload.</p>
      </div>

      {}
      <div className="flex gap-1 border-b border-slate-800">
        {([
          { id: 'generate', label: 'Generative Builder', icon: Layers },
          { id: 'gallery', label: `Gallery (${generatedCollection.length})`, icon: ImageIcon },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium transition-colors relative ${activeTab === id ? 'text-blue-400' : 'text-slate-400 hover:text-white'}`}>
            <Icon className="w-4 h-4" /> {label}
            {activeTab === id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />}
          </button>
        ))}
      </div>

      {}
      {activeTab === 'generate' && (
        <div className="space-y-6">
          {}
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
            <h2 className="text-base font-bold text-white mb-4">Collection Settings</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Collection Name', key: 'name', placeholder: 'Cyber Apes' },
                { label: 'Symbol', key: 'symbol', placeholder: 'CYAP' },
                { label: 'Description', key: 'description', placeholder: 'A unique collection on Cronos…' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
                  <input type="text" value={(collectionMetadata as any)[key]} onChange={(e) => updateCollectionMetadata({ [key]: e.target.value })}
                    placeholder={placeholder} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Total Supply</label>
                <input type="number" value={contractConfig.maxSupply} min={1}
                  onChange={(e) => updateContractConfig({ maxSupply: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
              </div>
            </div>
          </div>

          {}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Trait Layers</h2>
                <p className="text-xs text-slate-500 mt-0.5">Tip: name files <code className="text-slate-400">Gold#5.png</code> to auto-set weight to 5. Higher weight = more common.</p>
              </div>
              <button onClick={() => addLayer({ id: uuidv4(), name: 'New Layer', traits: [] })}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors">
                <Plus className="w-4 h-4" /> Add Layer
              </button>
            </div>
            {layers.map((layer) => (
              <LayerCard key={layer.id} layer={layer}
                onUpdateName={(name) => updateLayerName(layer.id, name)}
                onRemove={() => removeLayer(layer.id)}
                onDrop={(files) => handleTraitDrop(files, layer.id)}
                onRemoveTrait={(traitId) => removeTraitFromLayer(layer.id, traitId)} />
            ))}
          </div>

          {}
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2"><Crown className="w-4 h-4 text-yellow-500" /> Legendary 1-of-1s <span className="text-slate-500 font-normal text-sm">({legendaries.length})</span></h2>
                <p className="text-xs text-slate-500 mt-0.5">These are injected directly — no collision with generative outputs.</p>
              </div>
            </div>
            <div {...getLegendaryRootProps()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${isLegendaryDragActive ? 'border-yellow-500 bg-yellow-500/10' : 'border-slate-700 hover:border-yellow-500/40 hover:bg-yellow-500/5'}`}>
              <input {...getLegendaryInputProps()} />
              <Crown className="w-8 h-8 text-yellow-500/40 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">Drop legendary NFTs here</p>
              <p className="text-slate-600 text-xs mt-1">They fill slots from your total supply</p>
            </div>
            {legendaries.length > 0 && (
              <div className="grid grid-cols-6 md:grid-cols-10 gap-2 mt-4">
                {legendaries.map((nft) => (
                  <div key={nft.id} className="group relative aspect-square bg-slate-800 rounded-lg overflow-hidden border border-yellow-500/40">
                    <img src={nft.image} alt={nft.name} className="w-full h-full object-cover" />
                    <button onClick={() => removeLegendary(nft.id)} className="absolute top-0.5 right-0.5 p-0.5 bg-red-500/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-2.5 h-2.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {}
          <div className="flex justify-center pt-2">
            <button onClick={generateCollection} disabled={isGenerating || layers.every((l) => l.traits.length === 0)}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg transition-colors flex items-center gap-3 shadow-lg shadow-blue-900/20">
              {isGenerating
                ? <><Loader2 className="w-6 h-6 animate-spin" /> Generating {contractConfig.maxSupply} NFTs…</>
                : <><Wand2 className="w-6 h-6" /> Generate {contractConfig.maxSupply} NFTs</>}
            </button>
          </div>
        </div>
      )}

      {}
      {activeTab === 'gallery' && (
        <div className="space-y-5">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-900 p-4 rounded-xl border border-slate-800">
            <div className="relative w-full md:w-80">
              <input type="text" placeholder="Search by name or trait…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
              <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">{filteredCollection.length} / {generatedCollection.length}</span>
              <button onClick={downloadCollection} disabled={isZipping || generatedCollection.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-colors">
                {isZipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download ZIP
              </button>
              <button onClick={() => navigate('/metadata')} disabled={generatedCollection.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-colors">
                Next: Metadata <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {generatedCollection.length === 0 ? (
            <div className="text-center py-20 bg-slate-900 rounded-xl border border-slate-800 border-dashed">
              <Layers className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">No NFTs Generated Yet</h3>
              <p className="text-slate-400 mb-6">Go to the Generative Builder tab, add your trait layers, then click Generate.</p>
              <button onClick={() => setActiveTab('generate')} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">Open Builder</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
              {filteredCollection.map((nft) => (
                <div key={nft.id} className={`group bg-slate-900 rounded-xl overflow-hidden border transition-all hover:shadow-xl hover:-translate-y-0.5 ${nft.isLegendary ? 'border-yellow-500/50' : 'border-slate-800 hover:border-slate-600'}`}>
                  <div className="relative aspect-square bg-slate-950 overflow-hidden">
                    <img src={nft.image} alt={nft.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                    <div className="absolute top-2 left-2">
                      <span className="bg-black/60 backdrop-blur-sm text-white text-[10px] font-mono px-1.5 py-0.5 rounded">#{(parseInt(nft.id) + 1).toString().padStart(4, '0')}</span>
                    </div>
                    {nft.isLegendary && <div className="absolute top-2 right-2"><span className="bg-yellow-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Crown className="w-2.5 h-2.5" />LEG</span></div>}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button onClick={() => downloadSingleNFT(nft)} className="p-2 bg-white text-slate-900 rounded-full hover:bg-slate-200 transition-colors" title="Download"><Download className="w-4 h-4" /></button>
                      <button onClick={() => nft.isLegendary ? removeLegendary(nft.id) : removeGeneratedNFT(nft.id)} className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors" title="Remove"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="font-bold text-white text-xs truncate mb-1">{nft.name}</p>
                    <p className="text-[10px] text-slate-500 mb-2">{calculateRarity(nft)}</p>
                    <div className="flex flex-wrap gap-1">
                      {nft.attributes.slice(0, 3).map((attr, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-slate-800 rounded text-[9px] text-slate-300 truncate max-w-full">{String(attr.value)}</span>
                      ))}
                      {nft.attributes.length > 3 && <span className="text-[9px] text-slate-500">+{nft.attributes.length - 3}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LayerCard({ layer, onUpdateName, onRemove, onDrop, onRemoveTrait }: {
  layer: any; onUpdateName: (n: string) => void; onRemove: () => void; onDrop: (f: File[]) => void; onRemoveTrait: (id: string) => void;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] } });
  const { updateTraitWeight } = useAppStore();
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/50 flex items-center gap-3">
        <GripVertical className="w-4 h-4 text-slate-600 cursor-move flex-shrink-0" />
        <input type="text" value={layer.name} onChange={(e) => onUpdateName(e.target.value)}
          className="bg-transparent text-white font-semibold text-sm focus:outline-none flex-1" placeholder="Layer name" />
        <span className="text-xs text-slate-500">{layer.traits.length} traits</span>
        <button onClick={onRemove} className="text-slate-600 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
      </div>
      <div className="p-4 flex gap-4 items-start overflow-x-auto">
        <div {...getRootProps()}
          className={`border-2 border-dashed rounded-lg flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-colors flex-shrink-0 w-24 h-24 ${isDragActive ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800'}`}>
          <input {...getInputProps()} />
          <Plus className="w-5 h-5 text-slate-500 mb-1" />
          <span className="text-[10px] text-slate-500">Add traits</span>
        </div>
        {layer.traits.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-slate-600 text-sm h-24 italic">No traits yet — drop PNG files here</div>
        )}
        {layer.traits.map((trait: TraitImage) => (
          <div key={trait.id} className="relative flex-shrink-0 w-24 group">
            <div className="aspect-square rounded-lg overflow-hidden border border-slate-700 bg-slate-800 mb-1 relative">
              <img src={trait.previewUrl} alt={trait.name} className="w-full h-full object-cover" />
              <button onClick={() => onRemoveTrait(trait.id)}
                className="absolute top-0.5 right-0.5 p-0.5 bg-red-500/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-2.5 h-2.5" /></button>
            </div>
            <p className="text-[10px] text-white text-center truncate">{trait.name}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <input type="range" min="1" max="100" value={trait.weight} onChange={(e) => updateTraitWeight(layer.id, trait.id, parseInt(e.target.value))}
                className="w-full h-1 accent-blue-500" />
              <span className="text-[9px] text-slate-500 w-6 flex-shrink-0">{trait.weight}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
export default AssetCreation;
