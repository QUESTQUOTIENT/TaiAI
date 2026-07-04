



export interface NormalizedMetadata {
  name: string;
  description?: string;
  image?: string;               
  animationUrl?: string;
  externalUrl?: string;
  backgroundColor?: string;
  youtubeUrl?: string;

  
  attributes: MetadataAttribute[];

  
  edition?: number;
  compiler?: string;
  tokenStandard?: string;       
  royaltyBps?: number;
  creators?: Creator[];

  
  collectionName?: string;
  collectionFamily?: string;

  
  raw: Record<string, unknown>;
}

export interface MetadataAttribute {
  trait_type: string;
  value: string | number;
  display_type?: string;
  max_value?: number;
}

export interface Creator {
  address: string;
  share: number;
  verified?: boolean;
}




export function parseEVMMetadata(raw: unknown): NormalizedMetadata {
  const obj = assertObject(raw);

  return {
    name: str(obj.name) ?? 'Unknown',
    description: str(obj.description),
    image: resolveUri(str(obj.image)),
    animationUrl: resolveUri(str(obj.animation_url)),
    externalUrl: str(obj.external_url),
    backgroundColor: str(obj.background_color),
    youtubeUrl: str(obj.youtube_url),
    attributes: parseEVMAttributes(obj.attributes),
    edition: num(obj.edition),
    compiler: str(obj.compiler),
    tokenStandard: detectEVMStandard(obj),
    royaltyBps: parseRoyaltyBps(obj),
    raw: obj,
  };
}


export function parseMetaplexMetadata(raw: unknown): NormalizedMetadata {
  const obj = assertObject(raw);

  const properties: any = obj.properties ?? {};
  const creators: Creator[] = Array.isArray(properties.creators)
    ? properties.creators.map((c: any) => ({ address: String(c.address ?? ''), share: Number(c.share ?? 0), verified: Boolean(c.verified) }))
    : [];

  const collection: any = obj.collection ?? {};

  return {
    name: str(obj.name) ?? 'Unknown',
    description: str(obj.description),
    image: resolveUri(str(obj.image)),
    animationUrl: resolveUri(str(properties.files?.[0]?.uri ?? obj.animation_url)),
    externalUrl: str(obj.external_url),
    attributes: parseMetaplexAttributes(obj.attributes),
    tokenStandard: str(obj.token_standard) ?? 'Metaplex',
    royaltyBps: num(obj.seller_fee_basis_points),
    creators,
    collectionName: str(collection.name),
    collectionFamily: str(collection.family),
    raw: obj,
  };
}


export function parseHeliusDASMetadata(raw: unknown): NormalizedMetadata {
  const obj = assertObject(raw);
  const content: any = obj.content ?? {};
  const meta: any = content.metadata ?? {};
  const links: any = content.links ?? {};
  const royalty: any = obj.royalty ?? {};
  const creatorsRaw: any[] = (obj.creators as any[]) ?? [];

  const creators: Creator[] = creatorsRaw.map((c: any) => ({
    address: String(c.address ?? ''),
    share: Number(c.share ?? 0),
    verified: Boolean(c.verified),
  }));

  const tokenStandard = detectDASStandard(obj);

  return {
    name: str(meta.name) ?? str(obj.name as any) ?? 'Unknown',
    description: str(meta.description),
    image: resolveUri(str(links.image)),
    animationUrl: resolveUri(str(links.animation_url)),
    externalUrl: str(links.external_url),
    attributes: parseMetaplexAttributes(meta.attributes),
    tokenStandard,
    royaltyBps: num(royalty.basis_points),
    creators,
    collectionName: (obj.grouping as any[])?.find((g: any) => g.group_key === 'collection')?.group_value,
    raw: obj,
  };
}


export function autoParseMetadata(raw: unknown): NormalizedMetadata {
  const obj = assertObject(raw);

  
  if (obj.content || obj.ownership || obj.compression) {
    return parseHeliusDASMetadata(obj);
  }

  
  if ('seller_fee_basis_points' in obj || (obj as any).properties?.creators) {
    return parseMetaplexMetadata(obj);
  }

  
  return parseEVMMetadata(obj);
}


export async function fetchAndParseMetadata(uri: string): Promise<NormalizedMetadata> {
  const url = resolveUri(uri);
  if (!url) throw new Error(`Cannot resolve metadata URI: ${uri}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    const json = await res.json();
    return autoParseMetadata(json);
  } finally {
    clearTimeout(timeout);
  }
}



function parseEVMAttributes(raw: unknown): MetadataAttribute[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a === 'object')
    .map((a: any) => ({
      trait_type: str(a.trait_type) ?? str(a.name) ?? 'Unknown',
      value: a.value ?? '',
      display_type: str(a.display_type),
      max_value: num(a.max_value),
    }))
    .filter((a) => a.trait_type);
}

function parseMetaplexAttributes(raw: unknown): MetadataAttribute[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a === 'object')
    .map((a: any) => ({
      trait_type: str(a.trait_type) ?? '',
      value: a.value ?? '',
      display_type: str(a.display_type),
    }))
    .filter((a) => a.trait_type);
}



function detectEVMStandard(obj: any): string {
  if (obj.decimals !== undefined) return 'ERC-1155';
  return 'ERC-721';
}

function detectDASStandard(obj: any): string {
  const compression: any = obj.compression;
  if (compression?.compressed) return 'cNFT';
  const tokenStandard = (obj.content as any)?.metadata?.token_standard;
  if (tokenStandard === 'ProgrammableNonFungible') return 'pNFT';
  return 'Metaplex';
}

function parseRoyaltyBps(obj: any): number | undefined {
  
  if (typeof obj.royalty_percentage === 'number') return obj.royalty_percentage * 100;
  if (typeof obj.royaltyFee === 'number') return obj.royaltyFee;
  return undefined;
}



const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
];

export function resolveUri(uri?: string | null): string | undefined {
  if (!uri) return undefined;
  if (uri.startsWith('ipfs://')) {
    const cid = uri.slice(7);
    return `${IPFS_GATEWAYS[0]}${cid}`;
  }
  if (uri.startsWith('ar://')) {
    return `https://arweave.net/${uri.slice(5)}`;
  }
  return uri;
}

function assertObject(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { throw new Error('Invalid metadata JSON string'); }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  throw new Error('Metadata must be a JSON object');
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}
