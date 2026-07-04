

import type { SupportedChain } from './chainAdapter';



export interface UnifiedNFT {
  
  id: string;               
  chain: SupportedChain;

  
  mintAddress?: string;     
  contractAddress?: string; 
  tokenId?: string;         

  
  name: string;
  description?: string;
  image?: string;           
  animationUrl?: string;
  externalUrl?: string;
  metadataUri?: string;     
  attributes: NFTAttribute[];

  
  collectionId?: string;        
  collectionName?: string;
  collectionMint?: string;      
  collectionContract?: string;  

  
  owner: string;
  ownerSince?: string;          

  
  isListed: boolean;
  listPrice?: string;           
  listPriceFormatted?: string;  
  listingTxHash?: string;
  marketplace?: 'native' | 'blur' | 'opensea' | 'tensor' | 'magic-eden';

  
  standard?: 'ERC721' | 'ERC1155' | 'Metaplex' | 'pNFT' | 'cNFT' | 'SPL';

  
  royaltyBps?: number;          
  royaltyRecipient?: string;

  
  supply?: number;
  maxSupply?: number;
  editionNumber?: number;

  
  rarityScore?: number;
  rarityRank?: number;
  rarityLabel?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

  
  mintedAt?: string;            
  updatedAt?: string;           

  
  raw?: Record<string, unknown>;
}

export interface NFTAttribute {
  trait_type: string;
  value: string | number;
  display_type?: 'string' | 'number' | 'boost_percentage' | 'boost_number' | 'date';
  max_value?: number;
}



export interface NFTListing {
  id: string;
  nftId: string;
  chain: SupportedChain;

  
  contractAddress?: string;
  tokenId?: string;

  
  mintAddress?: string;

  seller: string;
  price: string;            
  priceFormatted: string;
  currency: string;         
  marketplace: string;
  listingTxHash?: string;
  saleTxHash?: string;

  status: 'active' | 'sold' | 'cancelled' | 'expired';
  listedAt: string;
  expiresAt?: string;
  soldAt?: string;
  soldTo?: string;
}




export function fromEVMNFT(raw: Record<string, unknown>, chain: SupportedChain = 'cronos'): UnifiedNFT {
  const meta: any = (raw.metadata as any) ?? raw;
  const attributes = normaliseAttributes((meta.attributes ?? raw.attributes) as any[]);

  return {
    id: `${chain}:${raw.contractAddress ?? raw.contract_address}:${raw.tokenId ?? raw.token_id}`,
    chain,
    contractAddress: (raw.contractAddress ?? raw.contract_address ?? '') as string,
    tokenId: String(raw.tokenId ?? raw.token_id ?? ''),
    name: (meta.name ?? raw.name ?? 'Unknown') as string,
    description: (meta.description ?? raw.description) as string | undefined,
    image: resolveImage((meta.image ?? raw.image) as string | undefined),
    animationUrl: (meta.animation_url ?? raw.animation_url) as string | undefined,
    externalUrl: (meta.external_url ?? raw.external_url) as string | undefined,
    metadataUri: (raw.tokenURI ?? raw.token_uri ?? raw.metadataUri) as string | undefined,
    attributes,
    collectionContract: (raw.contractAddress ?? raw.contract_address ?? '') as string,
    owner: (raw.owner ?? raw.ownerAddress ?? raw.owner_address ?? '') as string,
    isListed: Boolean(raw.isListed ?? raw.is_listed ?? false),
    listPrice: raw.listPrice as string | undefined,
    standard: detectEVMStandard(raw),
    royaltyBps: raw.royaltyBps as number | undefined,
    raw: raw as Record<string, unknown>,
  };
}


export function fromSolanaNFT(raw: Record<string, unknown>): UnifiedNFT {
  const content: any = raw.content ?? {};
  const meta: any = content.metadata ?? raw.metadata ?? raw;
  const attributes = normaliseAttributes(meta.attributes as any[]);

  const mintAddress = (raw.id ?? raw.mintAddress ?? raw.mint ?? '') as string;

  return {
    id: `solana:${mintAddress}`,
    chain: 'solana',
    mintAddress,
    name: (meta.name ?? raw.name ?? 'Unknown') as string,
    description: (meta.description ?? raw.description) as string | undefined,
    image: resolveImage(content.links?.image ?? meta.image ?? raw.image as string),
    animationUrl: resolveImage(content.links?.animation_url ?? meta.animation_url as string),
    externalUrl: (meta.external_url ?? content.links?.external_url) as string | undefined,
    metadataUri: (content.json_uri ?? raw.uri ?? raw.metadataUri) as string | undefined,
    attributes,
    collectionMint: ((raw as any).grouping?.find?.((g: any) => g.group_key === 'collection')?.group_value) as string | undefined,
    owner: ((raw.ownership as any)?.owner ?? raw.owner ?? '') as string,
    isListed: Boolean(raw.isListed ?? false),
    listPrice: raw.listPrice as string | undefined,
    standard: detectSolanaStandard(raw),
    royaltyBps: (raw.royalty as any)?.basis_points as number | undefined,
    royaltyRecipient: ((raw.royalty as any)?.creators?.[0]?.address) as string | undefined,
    raw: raw as Record<string, unknown>,
  };
}



function resolveImage(uri?: string): string | undefined {
  if (!uri) return undefined;
  if (uri.startsWith('ipfs://')) {
    return uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }
  return uri;
}

function normaliseAttributes(raw: any[]): NFTAttribute[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a === 'object' && 'trait_type' in a)
    .map((a) => ({
      trait_type: String(a.trait_type),
      value: a.value,
      display_type: a.display_type,
      max_value: a.max_value,
    }));
}

function detectEVMStandard(raw: any): UnifiedNFT['standard'] {
  const type = (raw.tokenType ?? raw.token_type ?? raw.contractType ?? '').toString().toUpperCase();
  if (type.includes('1155')) return 'ERC1155';
  return 'ERC721';
}

function detectSolanaStandard(raw: any): UnifiedNFT['standard'] {
  const compression = raw.compression;
  if (compression?.compressed) return 'cNFT';
  const tokenStandard = raw.content?.metadata?.token_standard;
  if (tokenStandard === 'ProgrammableNonFungible') return 'pNFT';
  return 'Metaplex';
}


export function toDBRecord(nft: UnifiedNFT): Record<string, unknown> {
  const { raw: _raw, ...rest } = nft;
  return {
    ...rest,
    attributes: JSON.stringify(rest.attributes),
  };
}
