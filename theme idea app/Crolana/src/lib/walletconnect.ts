

import type { AppKit } from '@reown/appkit';
import { useAppStore } from '../store';
import { CRONOS_MAINNET, SOLANA_MAINNET } from '../types';

let modal: AppKit | null = null;
let unsubscribeEVM: (() => void) | null = null;
let unsubscribeSolana: (() => void) | null = null;


async function ensureInitialized(): Promise<AppKit> {
  if (modal) return modal;

  const enabled = import.meta.env.VITE_ENABLE_WALLETCONNECT === 'true';
  const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

  if (!enabled || !projectId) {
    throw new Error('WalletConnect is not enabled or VITE_WALLETCONNECT_PROJECT_ID is missing');
  }

  
  const { createAppKit } = await import('@reown/appkit');
  const { cronos, solana } = await import('@reown/appkit/networks');

  modal = createAppKit({
    projectId,
    networks: [cronos, solana],
    defaultNetwork: cronos,
    features: {
      analytics: false,
      
      
      
    },
    themeMode: 'dark',
    themeVariables: {
      '--w3m-accent': '#3B82F6', 
      
    },
    metadata: {
      name: 'Crolana',
      description: 'NFT + DeFi Launchpad for the Cronos blockchain',
      url: window.location.origin,
      icons: ['/favicon.ico', '/logo192.png'],
    },
  });

  
  
  unsubscribeEVM = modal.subscribeAccount(
    (account) => {
      const store = useAppStore.getState();
      if (account.isConnected && account.address) {
        store.setWalletAddress(account.address);
        
        if (store.network.type !== 'solana') {
          store.setNetwork(CRONOS_MAINNET);
        }
      } else {
        store.setWalletAddress(null);
      }
    },
    'eip155'
  );

  
  unsubscribeSolana = modal.subscribeAccount(
    (account) => {
      const store = useAppStore.getState();
      if (account.isConnected && account.address) {
        store.setSolanaWalletAddress(account.address);
        
        if (store.network.type !== 'solana') {
          store.setNetwork(SOLANA_MAINNET);
        }
      } else {
        store.setSolanaWalletAddress(null);
      }
    },
    'solana'
  );

  return modal;
}


export async function initializeWalletConnect(): Promise<void> {
  try {
    await ensureInitialized();
  } catch (error) {
    
    
    console.debug('WalletConnect initialization skipped:', error);
  }
}


export async function openWalletConnect(namespace?: 'eip155' | 'solana'): Promise<void> {
  try {
    const appKit = await ensureInitialized();
    await appKit.open({ namespace });
  } catch (error) {
    console.error('WalletConnect failed to open:', error);
    throw error;
  }
}


export function isWalletConnectEnabled(): boolean {
  const enabled = import.meta.env.VITE_ENABLE_WALLETCONNECT === 'true';
  const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
  return !!enabled && !!projectId && projectId !== 'YOUR_WALLETCONNECT_PROJECT_ID_HERE';
}


export async function disconnectWalletConnect(): Promise<void> {
  if (modal) {
    
    unsubscribeEVM?.();
    unsubscribeSolana?.();
    unsubscribeEVM = null;
    unsubscribeSolana = null;
    
    useAppStore.getState().setWalletAddress(null);
    useAppStore.getState().setSolanaWalletAddress(null);
    
    await modal.disconnect();
    modal = null;
  }
}
