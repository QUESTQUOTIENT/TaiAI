





export interface TraitImage {
  id: string;
  file: File;
  name: string;
  weight: number;     
  previewUrl: string;
}

export interface TraitLayer {
  id: string;
  name: string;
  order: number;
  required: boolean;  
  traits: TraitImage[];
}

export interface GeneratedNFT {
  id: string;
  tokenId: number;
  name: string;
  description: string;
  image: string;       
  attributes: NFTAttribute[];
  dnaHash: string;
  rarity: number;      
  rarityTier: 'Legendary' | 'Epic' | 'Rare' | 'Uncommon' | 'Common';
  isLegendary: boolean;
  file?: File;         
}

export interface NFTAttribute {
  trait_type: string;
  value: string;
}

export interface NFTMetadata {
  name: string;
  description: string;
  image: string;       
  attributes: NFTAttribute[];
  dna?: string;
  edition?: number;
  compiler?: string;
}

export interface LegendaryNFT {
  id: string;
  name: string;
  description: string;
  image: string;
  attributes: NFTAttribute[];
  file?: File;
  isLegendary: true;
}

export interface GenerationOptions {
  collectionName: string;
  collectionDescription: string;
  totalSupply: number;
  layers: TraitLayer[];
  legendaries?: LegendaryNFT[];
  seed?: number;
  maxAttempts?: number;
  startTokenId?: number;
}

export interface GenerationResult {
  nfts: GeneratedNFT[];
  totalGenerated: number;
  uniqueCount: number;
  legendaryCount: number;
  rarityStats: RarityStats;
}

export interface RarityStats {
  legendary: number;
  epic: number;
  rare: number;
  uncommon: number;
  common: number;
  traitDistribution: Record<string, Record<string, number>>;
}





function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 4294967296;
  };
}





function pickTrait(layer: TraitLayer, rng: () => number): TraitImage | null {
  if (layer.traits.length === 0) return null;

  let totalWeight = layer.traits.reduce((sum, t) => sum + t.weight, 0);
  
  if (!layer.required) totalWeight += 10;

  let roll = rng() * totalWeight;

  for (const trait of layer.traits) {
    roll -= trait.weight;
    if (roll <= 0) return trait;
  }

  return layer.required ? layer.traits[layer.traits.length - 1] : null;
}





function computeDNA(selection: (TraitImage | null)[]): string {
  return selection.map((t) => (t ? `${t.name}:${t.id}` : 'None')).join('|');
}





function computeRarity(
  selection: (TraitImage | null)[],
  layers: TraitLayer[],
): number {
  let score = 1;
  selection.forEach((trait, i) => {
    const layer = layers[i];
    if (!layer) return;
    if (!trait) {
      score *= 0.1; 
      return;
    }
    const totalWeight = layer.traits.reduce((sum, t) => sum + t.weight, 0);
    score *= trait.weight / totalWeight;
  });
  return score;
}

function rarityTier(score: number): GeneratedNFT['rarityTier'] {
  if (score < 0.005) return 'Legendary';
  if (score < 0.02) return 'Epic';
  if (score < 0.08) return 'Rare';
  if (score < 0.25) return 'Uncommon';
  return 'Common';
}





export async function compositeImage(
  traits: (TraitImage | null)[],
  size = 1024,
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);

  for (const trait of traits) {
    if (!trait) continue;
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, size, size);
        resolve();
      };
      img.onerror = reject;
      img.src = trait.previewUrl;
    });
  }

  return canvas.toDataURL('image/png');
}





export async function generateCollection(
  opts: GenerationOptions,
  onProgress?: (generated: number, total: number, current?: string) => void,
): Promise<GenerationResult> {
  const {
    collectionName, collectionDescription, totalSupply,
    layers, legendaries = [], seed = Date.now(),
    maxAttempts = 100, startTokenId = 1,
  } = opts;

  const rng = seededRandom(seed);
  const activeLayers = [...layers]
    .filter((l) => l.traits.length > 0)
    .sort((a, b) => a.order - b.order);

  const nfts: GeneratedNFT[] = [];
  const usedDNAs = new Set<string>();
  let tokenId = startTokenId;

  
  for (const leg of legendaries) {
    nfts.push({
      id: leg.id,
      tokenId: tokenId++,
      name: leg.name || `${collectionName} Legendary #${tokenId - 1}`,
      description: leg.description || collectionDescription,
      image: leg.image,
      attributes: [...leg.attributes, { trait_type: 'Rarity', value: 'Legendary' }],
      dnaHash: `legendary-${leg.id}`,
      rarity: 0.0001,
      rarityTier: 'Legendary',
      isLegendary: true,
      file: leg.file,
    });
    onProgress?.(nfts.length, totalSupply, `Legendary: ${leg.name}`);
  }

  
  const toGenerate = totalSupply - legendaries.length;
  let attempts = 0;
  const maxTotalAttempts = toGenerate * maxAttempts;

  while (nfts.length - legendaries.length < toGenerate) {
    if (attempts++ > maxTotalAttempts) {
      throw new Error(
        `Could not generate ${toGenerate} unique NFTs after ${maxTotalAttempts} attempts. ` +
        `Add more trait variations to increase uniqueness.`,
      );
    }

    const selection = activeLayers.map((layer) => pickTrait(layer, rng));
    const dna = computeDNA(selection);

    if (usedDNAs.has(dna)) continue;
    usedDNAs.add(dna);

    const rarity = computeRarity(selection, activeLayers);
    const tier = rarityTier(rarity);

    const attributes: NFTAttribute[] = selection
      .map((trait, i) => ({
        trait_type: activeLayers[i].name,
        value: trait ? trait.name : 'None',
      }))
      .filter((attr) => attr.value !== 'None' || activeLayers[nfts.length] !== undefined);

    attributes.push({ trait_type: 'Rarity Tier', value: tier });

    
    let image = '';
    try {
      image = await compositeImage(selection);
    } catch {
      
      image = generatePlaceholderImage(tokenId, collectionName);
    }

    const n = nfts.length - legendaries.length + 1;
    nfts.push({
      id: `nft-${tokenId}`,
      tokenId: tokenId++,
      name: `${collectionName} #${n}`,
      description: collectionDescription,
      image,
      attributes,
      dnaHash: dna,
      rarity,
      rarityTier: tier,
      isLegendary: false,
    });

    onProgress?.(nfts.length, totalSupply, `Generating #${n}`);
  }

  
  const sorted = [...nfts].sort((a, b) => a.rarity - b.rarity);
  sorted.forEach((nft, rank) => { (nft as any).rarityRank = rank + 1; });

  const rarityStats = computeRarityStats(nfts, activeLayers);

  return {
    nfts,
    totalGenerated: nfts.length,
    uniqueCount: usedDNAs.size,
    legendaryCount: legendaries.length,
    rarityStats,
  };
}





function computeRarityStats(nfts: GeneratedNFT[], layers: TraitLayer[]): RarityStats {
  const stats: RarityStats = {
    legendary: 0, epic: 0, rare: 0, uncommon: 0, common: 0,
    traitDistribution: {},
  };

  for (const nft of nfts) {
    if (nft.rarityTier === 'Legendary') stats.legendary++;
    else if (nft.rarityTier === 'Epic') stats.epic++;
    else if (nft.rarityTier === 'Rare') stats.rare++;
    else if (nft.rarityTier === 'Uncommon') stats.uncommon++;
    else stats.common++;

    for (const attr of nft.attributes) {
      if (!stats.traitDistribution[attr.trait_type]) stats.traitDistribution[attr.trait_type] = {};
      const dist = stats.traitDistribution[attr.trait_type];
      dist[attr.value] = (dist[attr.value] || 0) + 1;
    }
  }

  return stats;
}





export function generateMetadataJSON(
  nft: GeneratedNFT,
  imageUri: string,
  collectionName: string,
): NFTMetadata {
  return {
    name: nft.name,
    description: nft.description,
    image: imageUri,
    attributes: nft.attributes,
    dna: nft.dnaHash,
    edition: nft.tokenId,
    compiler: 'Crolana',
  };
}

export function exportMetadataAsJSON(nfts: GeneratedNFT[], baseImageUri: string, collectionName: string): string {
  const metadata = nfts.map((nft) =>
    generateMetadataJSON(nft, `${baseImageUri}/${nft.tokenId}.png`, collectionName),
  );
  return JSON.stringify(metadata, null, 2);
}

export function exportSingleMetadata(nft: GeneratedNFT, imageUri: string): string {
  return JSON.stringify(generateMetadataJSON(nft, imageUri, nft.name), null, 2);
}





export function generateRarityReport(nfts: GeneratedNFT[], layers: TraitLayer[]): string {
  const total = nfts.length;
  const stats = computeRarityStats(nfts, layers);

  let report = `# ${total} NFT Rarity Report\n\n`;
  report += `## Rarity Tier Distribution\n`;
  report += `- Legendary: ${stats.legendary} (${((stats.legendary / total) * 100).toFixed(2)}%)\n`;
  report += `- Epic: ${stats.epic} (${((stats.epic / total) * 100).toFixed(2)}%)\n`;
  report += `- Rare: ${stats.rare} (${((stats.rare / total) * 100).toFixed(2)}%)\n`;
  report += `- Uncommon: ${stats.uncommon} (${((stats.uncommon / total) * 100).toFixed(2)}%)\n`;
  report += `- Common: ${stats.common} (${((stats.common / total) * 100).toFixed(2)}%)\n\n`;

  report += `## Trait Distribution\n\n`;
  for (const [layerName, traits] of Object.entries(stats.traitDistribution)) {
    report += `### ${layerName}\n`;
    const sorted = Object.entries(traits).sort((a, b) => a[1] - b[1]);
    for (const [traitName, count] of sorted) {
      const pct = ((count / total) * 100).toFixed(2);
      report += `- ${traitName}: ${count} (${pct}%)\n`;
    }
    report += '\n';
  }

  return report;
}





function generatePlaceholderImage(tokenId: number, collectionName: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  
  const hue = (tokenId * 37) % 360;
  const gradient = ctx.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, `hsl(${hue}, 70%, 20%)`);
  gradient.addColorStop(1, `hsl(${(hue + 60) % 360}, 70%, 40%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(collectionName, 256, 220);
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText(`#${tokenId}`, 256, 300);

  return canvas.toDataURL('image/png');
}





export function shuffleCollection(nfts: GeneratedNFT[], seed?: number): GeneratedNFT[] {
  const rng = seededRandom(seed ?? Date.now());
  const arr = [...nfts];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  
  return arr.map((nft, idx) => ({ ...nft, tokenId: idx + 1, name: nft.name.replace(/#\d+$/, `#${idx + 1}`) }));
}





export async function previewNFT(
  layers: TraitLayer[],
  selectedTraits?: Record<string, string>,
): Promise<string> {
  const activeLayers = [...layers]
    .filter((l) => l.traits.length > 0)
    .sort((a, b) => a.order - b.order);

  const selection = activeLayers.map((layer) => {
    if (selectedTraits && selectedTraits[layer.name]) {
      return layer.traits.find((t) => t.name === selectedTraits[layer.name]) ?? null;
    }
    
    return layer.traits[Math.floor(Math.random() * layer.traits.length)] ?? null;
  });

  return compositeImage(selection);
}
