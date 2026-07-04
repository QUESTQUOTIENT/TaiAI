declare global {
  interface Window {
    
    solana?: {
      isPhantom?: boolean;
      publicKey: { toString(): string; toBase58(): string } | null;
      isConnected: boolean;
      connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string; toBase58(): string } }>;
      disconnect(): Promise<void>;
      signTransaction(tx: any): Promise<any>;
      signAllTransactions(txs: any[]): Promise<any[]>;
      signMessage(msg: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array }>;
      signAndSendTransaction(tx: any, opts?: any): Promise<{ signature: string }>;
      on(event: string, handler: (...args: any[]) => void): void;
      off(event: string, handler: (...args: any[]) => void): void;
      request(params: { method: string; params?: any }): Promise<any>;
    };
  }
}

export type NetworkType = 'evm' | 'solana';

export type Network = {
  chainId: number;       
  name: string;
  rpcUrl: string;
  symbol: string;
  explorerUrl: string;
  isTestnet: boolean;
  type?: NetworkType;    
  cluster?: string;      
};

export const CRONOS_MAINNET: Network = {
  chainId: 25,
  name: 'Cronos Mainnet',
  rpcUrl: 'https://evm.cronos.org',
  symbol: 'CRO',
  explorerUrl: 'https://explorer.cronos.org',
  isTestnet: false,
};

export const CRONOS_TESTNET: Network = {
  chainId: 338,
  name: 'Cronos Testnet',
  rpcUrl: 'https://cronos-testnet.drpc.org',
  symbol: 'TCRO',
  explorerUrl: 'https://explorer.cronos.org/testnet',
  isTestnet: true,
};
export const SOLANA_MAINNET: Network = {
  chainId: 0,
  name: 'Solana Mainnet',
  rpcUrl: 'https://api.mainnet-beta.solana.com',
  symbol: 'SOL',
  explorerUrl: 'https://solscan.io',
  isTestnet: false,
  type: 'solana',
  cluster: 'mainnet-beta',
};

export const SOLANA_DEVNET: Network = {
  chainId: 0,
  name: 'Solana Devnet',
  rpcUrl: 'https://api.devnet.solana.com',
  symbol: 'SOL',
  explorerUrl: 'https://solscan.io/?cluster=devnet',
  isTestnet: true,
  type: 'solana',
  cluster: 'devnet',
};


export function isSolanaNetwork(network: Network): boolean {
  return network.type === 'solana';
}


export function isEvmNetwork(network: Network): boolean {
  return !network.type || network.type === 'evm';
}


export type Asset = {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  attributes: Attribute[];
};

export type Attribute = {
  trait_type: string;
  value: string | number;
};

export type CollectionMetadata = {
  name: string;
  symbol: string;
  description: string;
  external_url: string;
  image: string; 
  royalty_percentage: number;
  royalty_recipient: string;
};

export type ContractConfig = {
  type: 'ERC721' | 'ERC1155';
  name: string;
  symbol: string;
  maxSupply: number;
  mintPrice: string; 
  baseURI: string;
  isRevealed: boolean;
  royaltyReceiver: string;
  royaltyFee: number; 
};


export type TraitImage = {
  id: string;
  file: File;
  name: string;
  weight: number;
  previewUrl: string;
};

export type TraitLayer = {
  id: string;
  name: string;
  traits: TraitImage[];
};

export type GeneratedNFT = {
  id: string;
  name: string;
  description: string;
  image: string; 
  attributes: Attribute[];
  isLegendary?: boolean;
  file?: File; 
};

export type NotificationType = 'success' | 'error' | 'info' | 'loading' | 'warning';

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  duration?: number;
};

export type TokenMetadata = {
  id: string;
  name: string;
  description: string;
  image: string;
  animation_url?: string;
  external_url?: string;
  attributes: Attribute[];
  [key: string]: any; 
};

export type ContractType = 'ERC721' | 'ERC721A' | 'ERC1155';

export type SupplySettings = {
  type: 'fixed' | 'unlimited';
  maxSupply: number;
  maxPerWallet: number;
  maxPerTransaction: number;
  startTokenId: number;
  reservedSupply: number;
};

export type MintSettings = {
  publicMint: {
    enabled: boolean;
    price: string;
    maxPerTx: number;
    startTime: string;
    endTime: string;
  };
  allowlistMint: {
    enabled: boolean;
    price: string;
    merkleRoot: string;
  };
  freeMint: {
    enabled: boolean;
    maxPerWallet: number;
  };
  dutchAuction: {
    enabled: boolean;
    startPrice: string;
    endPrice: string;
    duration: number;
    interval: number;
  };
  isPaused: boolean;
};

export type RoyaltySettings = {
  percentage: number; 
  receiver: string;
  isEditable: boolean;
};

export type AdvancedControls = {
  baseURI: string;
  isRevealed: boolean;
  hiddenURI: string;
  isBurnable: boolean;
  isPausable: boolean;
  isOwnerMint: boolean;
  isBatchMint: boolean;
  isMetadataFrozen: boolean;
  isUpgradeable: boolean;
  isSoulbound: boolean;
};

export type GasStrategy = {
  mode: 'auto' | 'manual';
  gasPrice: string; 
  gasLimit: string;
};

export type AdvancedContractConfig = {
  name: string;
  symbol: string;
  type: ContractType;
  supply: SupplySettings;
  mint: MintSettings;
  royalty: RoyaltySettings;
  advanced: AdvancedControls;
  gas: GasStrategy;
};

export type ValidationResult = {
  isValid: boolean;
  errors: string[];
  warnings: string[];
};

export type MetadataState = {
  tokenMetadata: TokenMetadata[];
  validationResult: ValidationResult;
};

export type IpfsProvider = 'pinata' | 'infura' | 'lighthouse' | 'manual';

export type IpfsConfig = {
  provider: IpfsProvider;
  apiKey: string;
  apiSecret: string; 
  secret: string;    
  jwt: string;
  gateway: string;
};

export type MintPhase = {
  id: string;
  name: string;
  type: 'public' | 'allowlist';
  price: string; 
  maxPerWallet: number;
  maxPerTransaction: number;
  startTime: string; 
  endTime: string; 
  merkleRoot?: string;
  allowlist?: string[]; 
  isActive: boolean;
};

export type AirdropRecipient = {
  address: string;
  amount: number;
};

export type MintActivity = {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  from: string;
  tokenId: number;
  price: string;
  gasUsed: string;
};

export type AnalyticsData = {
  totalSupply: number;
  maxSupply: number;
  revenue: string;
  totalGasUsed: string;
  uniqueMinters: number;
};

export type AppState = {
  currentStep: number;
  walletAddress: string | null;       
  solanaWalletAddress: string | null; 
  network: Network;
  assets: Asset[];
  collectionMetadata: CollectionMetadata;
  contractConfig: ContractConfig;
  advancedContractConfig: AdvancedContractConfig; 
  deployedAddress: string | null;
  ipfsCid: string | null;
  ipfsConfig: IpfsConfig; 
  
  
  layers: TraitLayer[];
  legendaries: GeneratedNFT[];
  generatedCollection: GeneratedNFT[];

  
  tokenMetadata: TokenMetadata[];
  validationResult: ValidationResult;

  
  notifications: AppNotification[];

  
  mintPhases: MintPhase[];
  mintActivity: MintActivity[];
  analyticsData: AnalyticsData | null;
  
  
  setWalletAddress: (address: string | null) => void;
  setSolanaWalletAddress: (address: string | null) => void;
  setNetwork: (network: Network) => void;
  addAsset: (asset: Asset) => void;
  updateCollectionMetadata: (metadata: Partial<CollectionMetadata>) => void;
  updateContractConfig: (config: Partial<ContractConfig>) => void;
  updateAdvancedContractConfig: (config: Partial<AdvancedContractConfig>) => void; 
  setDeployedAddress: (address: string) => void;
  setIpfsCid: (cid: string) => void;
  setIpfsConfig: (config: Partial<IpfsConfig>) => void; 
  nextStep: () => void;
  prevStep: () => void;
  
  
  addLayer: (layer: TraitLayer) => void;
  removeLayer: (layerId: string) => void;
  updateLayerName: (layerId: string, name: string) => void;
  addTraitsToLayer: (layerId: string, traits: TraitImage[]) => void;
  removeTraitFromLayer: (layerId: string, traitId: string) => void;
  updateTraitWeight: (layerId: string, traitId: string, weight: number) => void;
  setGeneratedCollection: (collection: GeneratedNFT[]) => void;
  addLegendaries: (items: GeneratedNFT[]) => void;
  removeLegendary: (id: string) => void;
  removeGeneratedNFT: (id: string) => void;
  reorderLayers: (startIndex: number, endIndex: number) => void;

  
  setTokenMetadata: (metadata: TokenMetadata[]) => void;
  updateTokenMetadata: (id: string, metadata: Partial<TokenMetadata>) => void;
  updateAllTokenMetadata: (updates: Partial<TokenMetadata>) => void;
  validateMetadata: () => void;

  
  addMintPhase: (phase: MintPhase) => void;
  updateMintPhase: (id: string, phase: Partial<MintPhase>) => void;
  removeMintPhase: (id: string) => void;
  setMintActivity: (activity: MintActivity[]) => void;
  addMintActivity: (activity: MintActivity) => void;
  setAnalyticsData: (data: AnalyticsData | null) => void;

  
  theme: AppTheme;

  
  addNotification: (notification: Omit<AppNotification, 'id'>) => string;
  removeNotification: (id: string) => void;
  updateNotification: (id: string, updates: Partial<AppNotification>) => void;

  
  setTheme: (theme: Partial<AppTheme>) => void;
  applyTheme: (preset: string) => void;
};

export type AppTheme = {
  preset: string;
  
  bgBase: string;       
  bgSurface: string;    
  bgElevated: string;   
  bgSidebar: string;    
  bgRaised: string;     
  
  borderColor: string;
  
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  
  accentPrimary: string;
  accentHover: string;
  accentText: string;
  
  colorSuccess: string;
  colorWarning: string;
  colorError: string;
  colorInfo: string;
};

export const THEME_PRESETS: Record<string, AppTheme> = {
  midnight: {
    preset: 'midnight',
    bgBase: '#020817', bgSurface: '#0f172a', bgElevated: '#030712', bgSidebar: '#0f172a',
    bgRaised: '#1e293b',
    borderColor: '#1e293b', textPrimary: '#f8fafc', textSecondary: '#94a3b8', textMuted: '#475569',
    accentPrimary: '#3b82f6', accentHover: '#2563eb', accentText: '#ffffff',
    colorSuccess: '#22c55e', colorWarning: '#f59e0b', colorError: '#ef4444', colorInfo: '#06b6d4',
  },
  obsidian: {
    preset: 'obsidian',
    bgBase: '#09090b', bgSurface: '#18181b', bgElevated: '#09090b', bgSidebar: '#18181b',
    bgRaised: '#27272a',
    borderColor: '#27272a', textPrimary: '#fafafa', textSecondary: '#a1a1aa', textMuted: '#52525b',
    accentPrimary: '#a855f7', accentHover: '#9333ea', accentText: '#ffffff',
    colorSuccess: '#22c55e', colorWarning: '#f59e0b', colorError: '#ef4444', colorInfo: '#8b5cf6',
  },
  forest: {
    preset: 'forest',
    bgBase: '#0a1628', bgSurface: '#0f2032', bgElevated: '#071220', bgSidebar: '#0a1628',
    bgRaised: '#1a3a50',
    borderColor: '#1a3a50', textPrimary: '#e2f0f7', textSecondary: '#7eb8d4', textMuted: '#3d7a9a',
    accentPrimary: '#22c55e', accentHover: '#16a34a', accentText: '#ffffff',
    colorSuccess: '#22c55e', colorWarning: '#f59e0b', colorError: '#ef4444', colorInfo: '#06b6d4',
  },
  flame: {
    preset: 'flame',
    bgBase: '#130a04', bgSurface: '#1c1008', bgElevated: '#0e0702', bgSidebar: '#1c1008',
    bgRaised: '#3d1f0a',
    borderColor: '#3d1f0a', textPrimary: '#fef3e2', textSecondary: '#d4956a', textMuted: '#7a4820',
    accentPrimary: '#f97316', accentHover: '#ea580c', accentText: '#ffffff',
    colorSuccess: '#22c55e', colorWarning: '#fbbf24', colorError: '#ef4444', colorInfo: '#fb923c',
  },
  arctic: {
    preset: 'arctic',
    bgBase: '#f8fafc', bgSurface: '#f1f5f9', bgElevated: '#e2e8f0', bgSidebar: '#f1f5f9',
    bgRaised: '#e2e8f0',
    borderColor: '#cbd5e1', textPrimary: '#0f172a', textSecondary: '#475569', textMuted: '#94a3b8',
    accentPrimary: '#3b82f6', accentHover: '#2563eb', accentText: '#ffffff',
    colorSuccess: '#16a34a', colorWarning: '#d97706', colorError: '#dc2626', colorInfo: '#0891b2',
  },
  rose: {
    preset: 'rose',
    bgBase: '#0d0a0e', bgSurface: '#1a1020', bgElevated: '#0a0710', bgSidebar: '#1a1020',
    bgRaised: '#2d1a3d',
    borderColor: '#2d1a3d', textPrimary: '#fdf2f8', textSecondary: '#d8b4c8', textMuted: '#6b4060',
    accentPrimary: '#ec4899', accentHover: '#db2777', accentText: '#ffffff',
    colorSuccess: '#22c55e', colorWarning: '#f59e0b', colorError: '#ef4444', colorInfo: '#a855f7',
  },
  
  cronos: {
    preset: 'cronos',
    bgBase: '#020c07',    
    bgSurface: '#071a10', 
    bgElevated: '#010905',
    bgSidebar: '#04120a', 
    bgRaised: '#0d3320',  
    borderColor: '#0f4025',
    textPrimary: '#ecfdf5',
    textSecondary: '#6ee7b7',
    textMuted: '#166534', 
    accentPrimary: '#10b981',
    accentHover: '#059669',  
    accentText: '#ffffff',
    colorSuccess: '#4ade80',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorInfo: '#22d3ee',  
  },
};
