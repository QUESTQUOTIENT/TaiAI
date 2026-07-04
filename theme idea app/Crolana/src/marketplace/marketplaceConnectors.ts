





export interface MarketplaceListing {
  marketplace: string;
  collectionUrl: string;
  listUrl: string;
  verifyUrl?: string;
  submitUrl?: string;
  docsUrl: string;
  status: 'ready' | 'pending' | 'listed';
}

export interface CollectionSubmission {
  contractAddress: string;
  collectionName: string;
  description: string;
  bannerImage?: string;
  logoImage?: string;
  websiteUrl?: string;
  twitterUrl?: string;
  discordUrl?: string;
  royaltyBps: number;
  royaltyReceiver: string;
  chainId: number;
}

export interface MarketplaceInfo {
  id: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  recommended: boolean;
  supportsChronos: boolean;
  features: string[];
  listingType: 'auto' | 'manual' | 'api';
  feePercent: number;
}





export const CRONOS_MARKETPLACES: MarketplaceInfo[] = [
  {
    id: 'minted',
    name: 'Minted',
    description: 'Premier Cronos NFT marketplace. Auto-detected collections, creator royalties enforced.',
    url: 'https://minted.network',
    icon: '🟣',
    recommended: true,
    supportsChronos: true,
    features: ['Auto-detected', 'Creator royalties', 'CRO native', 'Low 2% fee'],
    listingType: 'auto',
    feePercent: 2,
  },
  {
    id: 'ebisusbay',
    name: "Ebisu's Bay",
    description: 'Original Cronos marketplace. Largest established user base on Cronos.',
    url: 'https://app.ebisusbay.com',
    icon: '🐉',
    recommended: true,
    supportsChronos: true,
    features: ['Verified collections', 'Launchpad', 'Staking rewards', 'Large community'],
    listingType: 'manual',
    feePercent: 2.5,
  },
  {
    id: 'opensea',
    name: 'OpenSea',
    description: "World's largest NFT marketplace. Cronos chain supported via multi-chain.",
    url: 'https://opensea.io',
    icon: '🌊',
    recommended: false,
    supportsChronos: true,
    features: ['500M+ users', 'Cross-chain', 'Auto-detected', 'Huge audience'],
    listingType: 'auto',
    feePercent: 2.5,
  },
  {
    id: 'tofunft',
    name: 'tofuNFT',
    description: 'Multi-chain marketplace with Cronos support and active community.',
    url: 'https://tofunft.com',
    icon: '🧊',
    recommended: false,
    supportsChronos: true,
    features: ['Multi-chain', 'Low fees', 'Active community', 'Easy listing'],
    listingType: 'auto',
    feePercent: 1.5,
  },
];





export function getMintedCollectionUrl(contractAddress: string): string {
  return `https://minted.network/collection/${contractAddress}`;
}

export function getMintedListingUrl(contractAddress: string): string {
  return `https://minted.network/collection/${contractAddress}`;
}

export function getMintedSubmitUrl(): string {
  return 'https://minted.network/submit-collection';
}

export function getEbisusBayCollectionUrl(contractAddress: string): string {
  return `https://app.ebisusbay.com/collection/${contractAddress}`;
}

export function getEbisusBaySubmitUrl(): string {
  return 'https://app.ebisusbay.com/apply-collection';
}

export function getOpenSeaCollectionUrl(contractAddress: string, chainId = 25): string {
  const chain = chainId === 338 ? 'cronos_testnet' : 'cronos';
  return `https://opensea.io/assets/${chain}/${contractAddress}`;
}

export function getOpenSeaAccountUrl(walletAddress: string): string {
  return `https://opensea.io/${walletAddress}`;
}

export function getTofuNFTCollectionUrl(contractAddress: string): string {
  return `https://tofunft.com/collection/cronos/${contractAddress}/items`;
}

export function getExplorerContractUrl(contractAddress: string, chainId = 25): string {
  const base = chainId === 338 ? 'https://explorer.cronos.org/testnet' : 'https://explorer.cronos.org';
  return `${base}/address/${contractAddress}`;
}





export function generateMarketplaceListings(
  contractAddress: string,
  chainId = 25,
): MarketplaceListing[] {
  return [
    {
      marketplace: 'Minted',
      collectionUrl: getMintedCollectionUrl(contractAddress),
      listUrl: getMintedCollectionUrl(contractAddress),
      submitUrl: getMintedSubmitUrl(),
      docsUrl: 'https://minted.network/docs',
      status: 'ready',
    },
    {
      marketplace: "Ebisu's Bay",
      collectionUrl: getEbisusBayCollectionUrl(contractAddress),
      listUrl: getEbisusBayCollectionUrl(contractAddress),
      submitUrl: getEbisusBaySubmitUrl(),
      docsUrl: 'https://app.ebisusbay.com/docs',
      status: 'pending',
    },
    {
      marketplace: 'OpenSea',
      collectionUrl: getOpenSeaCollectionUrl(contractAddress, chainId),
      listUrl: getOpenSeaCollectionUrl(contractAddress, chainId),
      verifyUrl: `https://opensea.io/asset-contracts/${contractAddress}`,
      docsUrl: 'https://docs.opensea.io/reference/api-overview',
      status: 'ready',
    },
    {
      marketplace: 'tofuNFT',
      collectionUrl: getTofuNFTCollectionUrl(contractAddress),
      listUrl: getTofuNFTCollectionUrl(contractAddress),
      docsUrl: 'https://tofunft.com/help',
      status: 'ready',
    },
  ];
}





export interface CollectionMetadataJSON {
  name: string;
  description: string;
  image: string;
  banner_image?: string;
  external_link?: string;
  seller_fee_basis_points: number;
  fee_recipient: string;
  social_links?: {
    twitter?: string;
    discord?: string;
    website?: string;
  };
}

export function generateCollectionMetadata(submission: CollectionSubmission): CollectionMetadataJSON {
  return {
    name: submission.collectionName,
    description: submission.description,
    image: submission.logoImage || '',
    banner_image: submission.bannerImage,
    external_link: submission.websiteUrl,
    seller_fee_basis_points: submission.royaltyBps,
    fee_recipient: submission.royaltyReceiver,
    social_links: {
      twitter: submission.twitterUrl,
      discord: submission.discordUrl,
      website: submission.websiteUrl,
    },
  };
}





export interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  required: boolean;
  status: 'pass' | 'fail' | 'warning' | 'unknown';
  actionUrl?: string;
  actionLabel?: string;
}

export function generateListingChecklist(params: {
  contractAddress: string;
  hasMetadata: boolean;
  hasImages: boolean;
  hasBaseURI: boolean;
  isRevealed: boolean;
  hasRoyalty: boolean;
  royaltyPercent: number;
  hasContractURI: boolean;
  totalSupply: number;
  maxSupply: number;
}): ChecklistItem[] {
  const {
    contractAddress, hasMetadata, hasImages, hasBaseURI,
    isRevealed, hasRoyalty, royaltyPercent, hasContractURI,
    totalSupply, maxSupply,
  } = params;

  return [
    {
      id: 'contract',
      label: 'Contract Deployed',
      description: contractAddress ? `Deployed at ${contractAddress.slice(0, 10)}…` : 'No contract deployed',
      required: true,
      status: contractAddress ? 'pass' : 'fail',
    },
    {
      id: 'images',
      label: 'NFT Images on IPFS',
      description: hasImages ? 'Images uploaded to IPFS' : 'Upload images to IPFS first',
      required: true,
      status: hasImages ? 'pass' : 'fail',
      actionUrl: hasImages ? undefined : '/ipfs',
      actionLabel: hasImages ? undefined : 'Upload to IPFS',
    },
    {
      id: 'metadata',
      label: 'Metadata JSONs on IPFS',
      description: hasMetadata ? 'Metadata uploaded successfully' : 'Metadata not yet uploaded',
      required: true,
      status: hasMetadata ? 'pass' : 'fail',
      actionUrl: hasMetadata ? undefined : '/ipfs',
      actionLabel: hasMetadata ? undefined : 'Upload Metadata',
    },
    {
      id: 'baseURI',
      label: 'Base URI Set',
      description: hasBaseURI ? 'baseURI configured on contract' : 'Set baseURI on contract',
      required: true,
      status: hasBaseURI ? 'pass' : 'warning',
      actionUrl: hasBaseURI ? undefined : '/minting',
      actionLabel: hasBaseURI ? undefined : 'Set Base URI',
    },
    {
      id: 'revealed',
      label: 'Collection Revealed',
      description: isRevealed ? 'NFTs are revealed' : 'Collection is unrevealed (hidden metadata)',
      required: false,
      status: isRevealed ? 'pass' : 'warning',
    },
    {
      id: 'royalty',
      label: 'Royalty Configured (ERC-2981)',
      description: hasRoyalty ? `${royaltyPercent}% royalty on secondary sales` : 'No royalty set',
      required: false,
      status: hasRoyalty ? (royaltyPercent > 0 ? 'pass' : 'warning') : 'warning',
    },
    {
      id: 'contractURI',
      label: 'Collection Metadata (contractURI)',
      description: hasContractURI ? 'contractURI set for marketplace display' : 'Set contractURI for better marketplace appearance',
      required: false,
      status: hasContractURI ? 'pass' : 'warning',
      actionUrl: '/marketplace',
      actionLabel: 'Configure',
    },
    {
      id: 'supply',
      label: 'Mint Progress',
      description: `${totalSupply}/${maxSupply} NFTs minted (${maxSupply > 0 ? Math.floor((totalSupply / maxSupply) * 100) : 0}%)`,
      required: false,
      status: totalSupply > 0 ? 'pass' : 'warning',
    },
  ];
}





export async function submitToMinted(submission: CollectionSubmission): Promise<{ success: boolean; message: string; url?: string }> {
  
  
  const collectionUrl = getMintedCollectionUrl(submission.contractAddress);

  return {
    success: true,
    message: 'Minted.network auto-detects Cronos NFT contracts. Your collection should appear at the URL below within minutes of your first mint.',
    url: collectionUrl,
  };
}





export async function checkOpenSeaListing(contractAddress: string, chainId = 25): Promise<{ found: boolean; url: string }> {
  const url = getOpenSeaCollectionUrl(contractAddress, chainId);
  
  return { found: true, url };
}





export function getMarketplaceSeaportAddress(chainId: number): string | null {
  
  if (chainId === 25) return '0x0000000000000068F116a894984e2DB1123eB395';
  return null;
}

export function getMintedExchangeAddress(chainId: number): string | null {
  
  if (chainId === 25) return null; 
  return null;
}
