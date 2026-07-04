import { create } from 'zustand';
import { AppState, CRONOS_MAINNET, CRONOS_TESTNET, TraitLayer, AppTheme, THEME_PRESETS } from './types';
import { v4 as uuidv4 } from 'uuid';

function applyThemeToCss(t: AppTheme) {
  const r = document.documentElement;
  r.style.setProperty('--bg-base',       t.bgBase);
  r.style.setProperty('--bg-surface',    t.bgSurface);
  r.style.setProperty('--bg-elevated',   t.bgElevated);
  r.style.setProperty('--bg-sidebar',    t.bgSidebar);
  r.style.setProperty('--bg-raised',     t.bgRaised ?? t.bgSurface);
  r.style.setProperty('--border-color',  t.borderColor);
  r.style.setProperty('--text-primary',  t.textPrimary);
  r.style.setProperty('--text-secondary',t.textSecondary);
  r.style.setProperty('--text-muted',    t.textMuted);
  r.style.setProperty('--accent-primary',t.accentPrimary);
  r.style.setProperty('--accent-hover',  t.accentHover);
  r.style.setProperty('--accent-text',   t.accentText);
  r.style.setProperty('--color-success', t.colorSuccess);
  r.style.setProperty('--color-warning', t.colorWarning);
  r.style.setProperty('--color-error',   t.colorError);
  r.style.setProperty('--color-info',    t.colorInfo);
  
  try { localStorage.setItem('crolana-theme', JSON.stringify(t)); } catch {}
}

function loadSavedTheme(): AppTheme {
  try {
    const saved = localStorage.getItem('crolana-theme');
    if (saved) {
      const parsed = JSON.parse(saved) as AppTheme;
      if (parsed.bgBase && parsed.accentPrimary) {
        
        if (!parsed.bgRaised) parsed.bgRaised = parsed.bgSurface;
        return parsed;
      }
    }
  } catch {}
  return THEME_PRESETS.midnight;
}

export const useAppStore = create<AppState>((set) => ({
  currentStep: 0,
  walletAddress: null,
  solanaWalletAddress: null,
  network: CRONOS_MAINNET,
  assets: [],
  collectionMetadata: {
    name: '',
    symbol: '',
    description: '',
    external_url: '',
    image: '',
    royalty_percentage: 5,
    royalty_recipient: '',
  },
  contractConfig: {
    type: 'ERC721',
    name: '',
    symbol: '',
    maxSupply: 1000,
    mintPrice: '0',
    baseURI: '',
    isRevealed: false,
    royaltyReceiver: '',
    royaltyFee: 500,
  },
  advancedContractConfig: {
    name: '',
    symbol: '',
    type: 'ERC721',
    supply: {
      type: 'fixed',
      maxSupply: 1000,
      maxPerWallet: 5,
      maxPerTransaction: 2,
      startTokenId: 1,
      reservedSupply: 0,
    },
    mint: {
      publicMint: {
        enabled: true,
        price: '0.0',
        maxPerTx: 5,
        startTime: '',
        endTime: '',
      },
      allowlistMint: {
        enabled: false,
        price: '0.0',
        merkleRoot: '',
      },
      freeMint: {
        enabled: false,
        maxPerWallet: 1,
      },
      dutchAuction: {
        enabled: false,
        startPrice: '0.0',
        endPrice: '0.0',
        duration: 0,
        interval: 0,
      },
      isPaused: false,
    },
    royalty: {
      percentage: 500,
      receiver: '',
      isEditable: true,
    },
    advanced: {
      baseURI: '',
      isRevealed: false,
      hiddenURI: '',
      isBurnable: false,
      isPausable: false,
      isOwnerMint: true,
      isBatchMint: false,
      isMetadataFrozen: false,
      isUpgradeable: false,
      isSoulbound: false,
    },
    gas: {
      mode: 'auto',
      gasPrice: '',
      gasLimit: '',
    },
  },
  deployedAddress: null,
  ipfsCid: null,
  ipfsConfig: {
    provider: 'lighthouse',
    apiKey: '',
    apiSecret: '',
    secret: '',
    jwt: '',
    gateway: 'https://gateway.lighthouse.storage/ipfs/',
  },

  
  mintPhases: [],
  mintActivity: [],
  analyticsData: null,

  
  layers: [
    { id: uuidv4(), name: 'Background', traits: [] },
    { id: uuidv4(), name: 'Body', traits: [] },
    { id: uuidv4(), name: 'Dress', traits: [] },
    { id: uuidv4(), name: 'Expression', traits: [] },
  ],
  legendaries: [],
  generatedCollection: [],
  tokenMetadata: [],
  validationResult: { isValid: true, errors: [], warnings: [] },
  notifications: [],
  theme: loadSavedTheme(),

  setWalletAddress: (address) => set({ walletAddress: address || null }),
  setSolanaWalletAddress: (address) => set({ solanaWalletAddress: address || null }),
  setNetwork: (network) => set({ network }),
  addAsset: (asset) => set((state) => ({ assets: [...state.assets, asset] })),
  updateCollectionMetadata: (metadata) =>
    set((state) => ({
      collectionMetadata: { ...state.collectionMetadata, ...metadata },
    })),
  updateContractConfig: (config) =>
    set((state) => ({
      contractConfig: { ...state.contractConfig, ...config },
    })),
  updateAdvancedContractConfig: (config) =>
    set((state) => ({
      advancedContractConfig: { ...state.advancedContractConfig, ...config },
    })),
  setDeployedAddress: (address) => set({ deployedAddress: address }),
  setIpfsCid: (cid) => set({ ipfsCid: cid }),
  setIpfsConfig: (config) =>
    set((state) => ({
      ipfsConfig: { ...state.ipfsConfig, ...config },
    })),
  nextStep: () => set((state) => ({ currentStep: state.currentStep + 1 })),
  prevStep: () => set((state) => ({ currentStep: Math.max(0, state.currentStep - 1) })),

  
  addLayer: (layer) => set((state) => ({ layers: [...state.layers, layer] })),
  removeLayer: (layerId) =>
    set((state) => ({ layers: state.layers.filter((l) => l.id !== layerId) })),
  updateLayerName: (layerId, name) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === layerId ? { ...l, name } : l
      ),
    })),
  addTraitsToLayer: (layerId, traits) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === layerId ? { ...l, traits: [...l.traits, ...traits] } : l
      ),
    })),
  removeTraitFromLayer: (layerId, traitId) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === layerId
          ? { ...l, traits: l.traits.filter((t) => t.id !== traitId) }
          : l
      ),
    })),
  updateTraitWeight: (layerId, traitId, weight) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === layerId
          ? {
              ...l,
              traits: l.traits.map((t) =>
                t.id === traitId ? { ...t, weight } : t
              ),
            }
          : l
      ),
    })),
  setGeneratedCollection: (collection) => set({ generatedCollection: collection }),
  addLegendaries: (items) => set((state) => ({ legendaries: [...state.legendaries, ...items] })),
  removeLegendary: (id) => set((state) => ({ legendaries: state.legendaries.filter((l) => l.id !== id) })),
  removeGeneratedNFT: (id) => set((state) => ({ generatedCollection: state.generatedCollection.filter((nft) => nft.id !== id) })),
  reorderLayers: (startIndex, endIndex) =>
    set((state) => {
      const result = Array.from(state.layers);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return { layers: result };
    }),

  
  setTokenMetadata: (metadata) => set({ tokenMetadata: metadata }),
  updateTokenMetadata: (id, updates) =>
    set((state) => ({
      tokenMetadata: state.tokenMetadata.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    })),
  updateAllTokenMetadata: (updates) =>
    set((state) => ({
      tokenMetadata: state.tokenMetadata.map((m) => ({ ...m, ...updates })),
    })),
  validateMetadata: () =>
    set((state) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      
      if (!state.collectionMetadata.name) errors.push("Collection name is missing.");
      if (!state.collectionMetadata.description) errors.push("Collection description is missing.");
      if (!state.collectionMetadata.image && !state.ipfsCid) warnings.push("Collection image/banner not set.");

      
      state.tokenMetadata.forEach((token) => {
        const tokenId = parseInt(token.id) + 1;
        if (!token.name) errors.push(`Token #${tokenId} missing name.`);
        if (!token.description) warnings.push(`Token #${tokenId} missing description.`);
        if (!token.image) {
          errors.push(`Token #${tokenId} missing image.`);
        } else if (!token.image.startsWith('ipfs://') && !token.image.startsWith('http') && !token.image.startsWith('data:')) {
          errors.push(`Token #${tokenId} image must be an IPFS, HTTP, or Data URI.`);
        }

        if (token.attributes) {
          if (!Array.isArray(token.attributes)) {
            errors.push(`Token #${tokenId} attributes must be an array.`);
          } else {
            token.attributes.forEach((attr, idx) => {
              if (!attr.trait_type) errors.push(`Token #${tokenId} attribute [${idx}] missing trait_type.`);
              if (attr.value === undefined || attr.value === null || attr.value === '') {
                errors.push(`Token #${tokenId} attribute [${idx}] missing value.`);
              }
            });
          }
        }
      });

      return {
        validationResult: {
          isValid: errors.length === 0,
          errors,
          warnings,
        },
      };
    }),

  
  addMintPhase: (phase) =>
    set((state) => ({ mintPhases: [...state.mintPhases, phase] })),
  updateMintPhase: (id, phase) =>
    set((state) => ({
      mintPhases: state.mintPhases.map((p) =>
        p.id === id ? { ...p, ...phase } : p
      ),
    })),
  removeMintPhase: (id) =>
    set((state) => ({
      mintPhases: state.mintPhases.filter((p) => p.id !== id),
    })),
  setMintActivity: (activity) => set({ mintActivity: activity }),
  addMintActivity: (activity) =>
    set((state) => ({ mintActivity: [activity, ...state.mintActivity] })),
  setAnalyticsData: (data) => set({ analyticsData: data }),

  
  
  
  
  addNotification: (notification) => {
    const id = uuidv4();
    set((state) => ({
      notifications: [...state.notifications, { ...notification, id }],
    }));
    if (notification.duration !== 0) {
      const delay = (typeof notification.duration === 'number' && notification.duration > 0)
        ? notification.duration
        : 5000;
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      }, delay);
    }
    return id;
  },
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
  updateNotification: (id, updates) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, ...updates } : n
      ),
    }));
    
    if (updates.type && updates.type !== 'loading') {
      const delay = (typeof updates.duration === 'number' && updates.duration > 0)
        ? updates.duration
        : 5000;
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      }, delay);
    }
  },

  setTheme: (partial) =>
    set((state) => {
      const next = { ...state.theme, ...partial };
      applyThemeToCss(next);
      return { theme: next };
    }),

  applyTheme: (preset) => {
    const t = THEME_PRESETS[preset] ?? THEME_PRESETS.midnight;
    applyThemeToCss(t);
    set({ theme: t });
  },
}));
