





export interface TraitLayer {
  id: string;
  name: string;
  order: number;
  traits: Trait[];
}

export interface Trait {
  id: string;
  name: string;
  weight: number;        
  imageData?: string;    
  filePath?: string;     
}

export interface GeneratedNFT {
  id: number;
  name: string;
  description: string;
  dnaHash: string;
  attributes: NFTAttribute[];
  imageData?: string;    
  rarity: number;        
  rarityRank?: number;
  isLegendary: boolean;
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
  compiler?: string;
}

export interface GenerationOptions {
  collectionName: string;
  collectionDescription: string;
  totalSupply: number;
  layers: TraitLayer[];
  legendaries?: LegendaryNFT[];
  maxAttempts?: number;  
  seed?: number;         
}

export interface LegendaryNFT {
  id: string;
  name: string;
  description: string;
  imageData: string;
  attributes: NFTAttribute[];
}

export interface RarityResult {
  rank: number;
  score: number;          
  traitScores: Record<string, number>;
}





export function computeDNA(attributes: NFTAttribute[]): string {
  const sorted = [...attributes].sort((a, b) => a.trait_type.localeCompare(b.trait_type));
  return sorted.map((a) => `${a.trait_type}:${a.value}`).join('|');
}





export function computeRarity(
  attributes: NFTAttribute[],
  layers: TraitLayer[],
): number {
  let probability = 1;
  for (const attr of attributes) {
    const layer = layers.find((l) => l.name === attr.trait_type);
    if (!layer || layer.traits.length === 0) continue;
    const totalWeight = layer.traits.reduce((s, t) => s + t.weight, 0);
    const trait = layer.traits.find((t) => t.name === attr.value);
    if (trait && totalWeight > 0) {
      probability *= trait.weight / totalWeight;
    }
  }
  return probability;
}

export function rankByRarity(collection: GeneratedNFT[]): GeneratedNFT[] {
  const sorted = [...collection].sort((a, b) => a.rarity - b.rarity);
  return sorted.map((nft, idx) => ({ ...nft, rarityRank: idx + 1 }));
}

export function getRarityLabel(rarity: number): string {
  if (rarity < 0.001) return 'Mythic';
  if (rarity < 0.01)  return 'Legendary';
  if (rarity < 0.05)  return 'Epic';
  if (rarity < 0.15)  return 'Rare';
  if (rarity < 0.35)  return 'Uncommon';
  return 'Common';
}





function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function selectTrait(layer: TraitLayer, seed: number): Trait {
  const totalWeight = layer.traits.reduce((s, t) => s + t.weight, 0);
  let random = seededRandom(seed) * totalWeight;
  for (const trait of layer.traits) {
    random -= trait.weight;
    if (random <= 0) return trait;
  }
  return layer.traits[layer.traits.length - 1];
}





export async function generateCollection(
  options: GenerationOptions,
  onProgress?: (current: number, total: number) => void,
): Promise<GeneratedNFT[]> {
  const {
    collectionName,
    collectionDescription,
    totalSupply,
    layers,
    legendaries = [],
    maxAttempts = 50,
    seed = Date.now(),
  } = options;

  const activeLayers = layers.filter((l) => l.traits.length > 0);
  if (activeLayers.length === 0) throw new Error('No trait layers with traits found');

  const toGenerate = Math.max(0, totalSupply - legendaries.length);
  const generatedHashes = new Set<string>();
  const collection: GeneratedNFT[] = [];

  let attempts = 0;

  for (let i = 0; i < toGenerate; i++) {
    let generated = false;

    while (!generated) {
      if (attempts >= toGenerate * maxAttempts) {
        throw new Error(
          `Could not generate ${toGenerate} unique NFTs after ${attempts} attempts. Add more trait variations or reduce supply.`,
        );
      }

      const attributes: NFTAttribute[] = [];

      for (let lIdx = 0; lIdx < activeLayers.length; lIdx++) {
        const layer = activeLayers[lIdx];
        const traitSeed = seed + i * 10000 + attempts * 1000 + lIdx;
        const trait = selectTrait(layer, traitSeed);
        attributes.push({ trait_type: layer.name, value: trait.name });
      }

      const dnaHash = computeDNA(attributes);

      if (!generatedHashes.has(dnaHash)) {
        generatedHashes.add(dnaHash);
        const rarity = computeRarity(attributes, activeLayers);

        collection.push({
          id: i + 1,
          name: `${collectionName} #${i + 1}`,
          description: collectionDescription,
          dnaHash,
          attributes,
          rarity,
          isLegendary: false,
        });

        generated = true;
        onProgress?.(i + 1, toGenerate);
      }

      attempts++;
    }
  }

  
  legendaries.forEach((leg, idx) => {
    collection.push({
      id: toGenerate + idx + 1,
      name: leg.name,
      description: leg.description,
      dnaHash: `legendary-${leg.id}`,
      attributes: leg.attributes,
      imageData: leg.imageData,
      rarity: 0,
      isLegendary: true,
    });
  });

  return rankByRarity(collection);
}





export function buildMetadata(
  nft: GeneratedNFT,
  ipfsImagesCid: string,
  options?: { royaltyBps?: number; royaltyAddr?: string; externalUrl?: string },
): NFTMetadata {
  const paddedId = String(nft.id).padStart(4, '0');
  return {
    name: nft.name,
    description: nft.description,
    image: `ipfs://${ipfsImagesCid}/${paddedId}.png`,
    attributes: nft.attributes,
    dna: nft.dnaHash,
    compiler: 'Cronos Studio',
    ...(options?.externalUrl ? { external_url: options.externalUrl } : {}),
  };
}

export function buildCollectionMetadata(opts: {
  name: string;
  description: string;
  imageCid: string;
  externalUrl?: string;
  royaltyBps?: number;
  royaltyAddr?: string;
}): object {
  return {
    name: opts.name,
    description: opts.description,
    image: `ipfs://${opts.imageCid}/banner.png`,
    external_link: opts.externalUrl || '',
    seller_fee_basis_points: opts.royaltyBps ?? 500,
    fee_recipient: opts.royaltyAddr ?? '',
  };
}

export function buildHiddenMetadata(opts: {
  name?: string;
  description?: string;
  imageCid: string;
}): object {
  return {
    name: opts.name ?? 'Mystery Box',
    description: opts.description ?? 'This NFT has not been revealed yet.',
    image: `ipfs://${opts.imageCid}/hidden.png`,
    attributes: [],
  };
}





export function exportAsJSON(metadata: NFTMetadata[]): string {
  return JSON.stringify(metadata, null, 2);
}

export function getTraitDistribution(collection: GeneratedNFT[]): Record<string, Record<string, number>> {
  const dist: Record<string, Record<string, number>> = {};
  for (const nft of collection) {
    for (const attr of nft.attributes) {
      if (!dist[attr.trait_type]) dist[attr.trait_type] = {};
      dist[attr.trait_type][attr.value] = (dist[attr.trait_type][attr.value] || 0) + 1;
    }
  }
  return dist;
}
