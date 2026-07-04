



export type SupportedChain = 'cronos' | 'solana';

export interface MintNFTParams {
  chain: SupportedChain;
  
  contractAddress?: string;
  tokenId?: number;
  toAddress?: string;
  metadataUri?: string;
  quantity?: number;
  
  walletPublicKey?: string;
  collectionMint?: string;
  name?: string;
  symbol?: string;
  uri?: string;
  sellerFeeBasisPoints?: number;
  creators?: Array<{ address: string; share: number }>;
}

export interface ListNFTParams {
  chain: SupportedChain;
  
  contractAddress?: string;
  tokenId?: number;
  price?: string; 
  
  mintAddress?: string;
  sellerPublicKey?: string;
  lamports?: string;
}

export interface BuyNFTParams {
  chain: SupportedChain;
  
  contractAddress?: string;
  tokenId?: number;
  buyerAddress?: string;
  value?: string; 
  
  mintAddress?: string;
  buyerPublicKey?: string;
  sellerPublicKey?: string;
  lamports?: string;
}

export interface GetNFTsParams {
  walletAddress: string;
  chain: SupportedChain;
  contractAddress?: string; 
  limit?: number;
  cursor?: string;
}

export interface UnifiedNFTResult {
  chain: SupportedChain;
  
  mintAddress?: string;  
  contractAddress?: string; 
  tokenId?: string;         
  
  name: string;
  description?: string;
  image?: string;
  metadataUri?: string;
  attributes?: Array<{ trait_type: string; value: string | number }>;
  
  owner: string;
  
  isListed?: boolean;
  listPrice?: string;
  
  raw?: Record<string, unknown>;
}

export interface TransactionResult {
  txHash: string;
  chain: SupportedChain;
  status: 'pending' | 'confirmed' | 'failed';
  blockNumber?: number;
  explorerUrl: string;
}

export interface ChainAdapter {
  chain: SupportedChain;
  mintNFT(params: MintNFTParams): Promise<TransactionResult>;
  listNFT(params: ListNFTParams): Promise<TransactionResult>;
  buyNFT(params: BuyNFTParams): Promise<TransactionResult>;
  getNFTs(params: GetNFTsParams): Promise<UnifiedNFTResult[]>;
  getTransaction(txHash: string): Promise<TransactionResult>;
  getNFTMetadata(identifier: string): Promise<UnifiedNFTResult | null>;
}



class CronosAdapter implements ChainAdapter {
  readonly chain: SupportedChain = 'cronos';

  private get rpc(): string {
    return (
      (typeof process !== 'undefined' && process.env?.CRONOS_MAINNET_RPC) ||
      'https://evm.cronos.org'
    );
  }

  private explorerUrl(txHash: string): string {
    return `https://explorer.cronos.org/tx/${txHash}`;
  }

  async mintNFT(params: MintNFTParams): Promise<TransactionResult> {
    
    
    throw new Error(
      '[CronosAdapter] mintNFT must be called via the backend route POST /api/cronos/mint ' +
      'or directly from a connected ethers signer using mintEngine.ts'
    );
  }

  async listNFT(params: ListNFTParams): Promise<TransactionResult> {
    const res = await fetch('/api/cronos/marketplace/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ChainAdapterError(this.chain, 'listNFT', err.error ?? res.statusText);
    }
    return res.json();
  }

  async buyNFT(params: BuyNFTParams): Promise<TransactionResult> {
    const res = await fetch('/api/cronos/marketplace/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ChainAdapterError(this.chain, 'buyNFT', err.error ?? res.statusText);
    }
    return res.json();
  }

  async getNFTs(params: GetNFTsParams): Promise<UnifiedNFTResult[]> {
    const qs = new URLSearchParams({
      wallet: params.walletAddress,
      ...(params.contractAddress && { contract: params.contractAddress }),
      ...(params.limit && { limit: String(params.limit) }),
      ...(params.cursor && { cursor: params.cursor }),
    });
    const res = await fetch(`/api/cronos/nfts?${qs}`);
    if (!res.ok) throw new ChainAdapterError(this.chain, 'getNFTs', res.statusText);
    const json = await res.json();
    return (json.nfts ?? []).map((n: any) => this.normalise(n));
  }

  async getTransaction(txHash: string): Promise<TransactionResult> {
    const res = await fetch(`/api/cronos/tx/${txHash}`);
    if (!res.ok) throw new ChainAdapterError(this.chain, 'getTransaction', res.statusText);
    return res.json();
  }

  async getNFTMetadata(contractAndTokenId: string): Promise<UnifiedNFTResult | null> {
    
    const [contractAddress, tokenId] = contractAndTokenId.split(':');
    const res = await fetch(`/api/cronos/nft/${contractAddress}/${tokenId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new ChainAdapterError(this.chain, 'getNFTMetadata', res.statusText);
    return this.normalise(await res.json());
  }

  private normalise(raw: any): UnifiedNFTResult {
    return {
      chain: 'cronos',
      contractAddress: raw.contractAddress ?? raw.contract_address,
      tokenId: String(raw.tokenId ?? raw.token_id ?? ''),
      name: raw.name ?? raw.metadata?.name ?? 'Unknown',
      description: raw.description ?? raw.metadata?.description,
      image: raw.image ?? raw.metadata?.image,
      metadataUri: raw.metadataUri ?? raw.tokenURI,
      attributes: raw.attributes ?? raw.metadata?.attributes ?? [],
      owner: raw.owner ?? raw.ownerAddress ?? '',
      isListed: raw.isListed ?? false,
      listPrice: raw.listPrice,
      raw,
    };
  }
}



class SolanaAdapter implements ChainAdapter {
  readonly chain: SupportedChain = 'solana';

  private explorerUrl(sig: string): string {
    return `https://solscan.io/tx/${sig}`;
  }

  async mintNFT(params: MintNFTParams): Promise<TransactionResult> {
    const res = await fetch('/api/solana/marketplace/mint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ChainAdapterError(this.chain, 'mintNFT', err.error ?? res.statusText);
    }
    return res.json();
  }

  async listNFT(params: ListNFTParams): Promise<TransactionResult> {
    const res = await fetch('/api/solana/marketplace/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ChainAdapterError(this.chain, 'listNFT', err.error ?? res.statusText);
    }
    return res.json();
  }

  async buyNFT(params: BuyNFTParams): Promise<TransactionResult> {
    const res = await fetch('/api/solana/marketplace/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ChainAdapterError(this.chain, 'buyNFT', err.error ?? res.statusText);
    }
    return res.json();
  }

  async getNFTs(params: GetNFTsParams): Promise<UnifiedNFTResult[]> {
    const qs = new URLSearchParams({
      wallet: params.walletAddress,
      ...(params.limit && { limit: String(params.limit) }),
      ...(params.cursor && { cursor: params.cursor }),
    });
    const res = await fetch(`/api/solana/nfts?${qs}`);
    if (!res.ok) throw new ChainAdapterError(this.chain, 'getNFTs', res.statusText);
    const json = await res.json();
    return (json.nfts ?? []).map((n: any) => this.normalise(n));
  }

  async getTransaction(signature: string): Promise<TransactionResult> {
    const res = await fetch(`/api/solana/tx/${signature}`);
    if (!res.ok) throw new ChainAdapterError(this.chain, 'getTransaction', res.statusText);
    return res.json();
  }

  async getNFTMetadata(mintAddress: string): Promise<UnifiedNFTResult | null> {
    const res = await fetch(`/api/solana/nft/${mintAddress}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new ChainAdapterError(this.chain, 'getNFTMetadata', res.statusText);
    return this.normalise(await res.json());
  }

  private normalise(raw: any): UnifiedNFTResult {
    const meta = raw.content?.metadata ?? raw.metadata ?? raw;
    return {
      chain: 'solana',
      mintAddress: raw.id ?? raw.mintAddress ?? raw.mint,
      name: meta.name ?? raw.name ?? 'Unknown',
      description: meta.description ?? raw.description,
      image: raw.content?.links?.image ?? meta.image ?? raw.image,
      metadataUri: raw.content?.json_uri ?? raw.uri ?? raw.metadataUri,
      attributes: meta.attributes ?? raw.attributes ?? [],
      owner: raw.ownership?.owner ?? raw.owner ?? '',
      isListed: raw.isListed ?? false,
      listPrice: raw.listPrice,
      raw,
    };
  }
}



const _adapters: Record<SupportedChain, ChainAdapter> = {
  cronos: new CronosAdapter(),
  solana: new SolanaAdapter(),
};


export function getChainAdapter(chain: SupportedChain): ChainAdapter {
  const adapter = _adapters[chain];
  if (!adapter) throw new Error(`[chainAdapter] Unsupported chain: "${chain}"`);
  return adapter;
}


export function detectChainFromAddress(address: string): SupportedChain | null {
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return 'cronos';
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return 'solana';
  return null;
}



export class ChainAdapterError extends Error {
  constructor(
    public readonly chain: SupportedChain,
    public readonly operation: string,
    message: string,
  ) {
    super(`[${chain}] ${operation}: ${message}`);
    this.name = 'ChainAdapterError';
  }
}
