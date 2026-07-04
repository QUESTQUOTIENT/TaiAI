

import { useState, useEffect, useCallback, useRef } from 'react';
import { getStoredAuthToken, saveAuthToken, clearAuthToken } from '../wallet/walletManager';
import type { SupportedChain } from '../lib/chainAdapter';



export type WalletType = 'metamask' | 'cryptocom' | 'coinbase' | 'phantom' | 'solflare' | 'injected';

export interface ConnectedWallet {
  address: string;
  chain: SupportedChain;
  walletType: WalletType;
  chainId?: number;       
  cluster?: string;       
  balance?: string;
  isAuthenticated: boolean;
}

export interface WalletSessionState {
  
  evmWallet: ConnectedWallet | null;
  solanaWallet: ConnectedWallet | null;

  
  activeChain: SupportedChain;

  
  isConnectingEVM: boolean;
  isConnectingSolana: boolean;

  
  authToken: string | null;

  
  hasMetaMask: boolean;
  hasPhantom: boolean;

  
  connectEVM(preferredType?: WalletType): Promise<ConnectedWallet>;
  connectSolana(): Promise<ConnectedWallet>;
  disconnectEVM(): void;
  disconnectSolana(): void;
  disconnectAll(): void;
  setActiveChain(chain: SupportedChain): void;
  authenticateWallet(chain: SupportedChain): Promise<string>;
  getActiveWallet(): ConnectedWallet | null;
}



export function useUnifiedWallet(): WalletSessionState {
  const [evmWallet, setEvmWallet] = useState<ConnectedWallet | null>(null);
  const [solanaWallet, setSolanaWallet] = useState<ConnectedWallet | null>(null);
  const [activeChain, setActiveChain] = useState<SupportedChain>('cronos');
  const [isConnectingEVM, setIsConnectingEVM] = useState(false);
  const [isConnectingSolana, setIsConnectingSolana] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(getStoredAuthToken());

  const evmListenerRef = useRef<(() => void) | null>(null);
  const solanaListenerRef = useRef<(() => void) | null>(null);

  const hasMetaMask = typeof window !== 'undefined' && !!(window as any).ethereum;
  const hasPhantom = typeof window !== 'undefined' && !!(window as any).solana?.isPhantom;

  

  const connectEVM = useCallback(async (preferredType?: WalletType): Promise<ConnectedWallet> => {
    if (!(window as any).ethereum) throw new Error('No EVM wallet detected. Please install MetaMask.');
    setIsConnectingEVM(true);

    try {
      const { ethers } = await import('ethers');
      let provider = (window as any).ethereum;

      
      if ((window as any).ethereum.providers && Array.isArray((window as any).ethereum.providers)) {
        const providers: any[] = (window as any).ethereum.providers;
        if (preferredType === 'metamask') provider = providers.find((p) => p.isMetaMask) ?? provider;
        else if (preferredType === 'cryptocom') provider = providers.find((p) => p.isCryptoCom) ?? provider;
        else if (preferredType === 'coinbase') provider = providers.find((p) => p.isCoinbaseWallet) ?? provider;
      }

      const browserProvider = new ethers.BrowserProvider(provider);
      await browserProvider.send('eth_requestAccounts', []);
      const signer = await browserProvider.getSigner();
      const address = await signer.getAddress();
      const network = await browserProvider.getNetwork();
      const chainId = Number(network.chainId);
      const balanceWei = await browserProvider.getBalance(address);
      const balance = ethers.formatEther(balanceWei);
      const walletType = detectEVMType(provider);

      const wallet: ConnectedWallet = {
        address,
        chain: 'cronos',
        walletType,
        chainId,
        balance,
        isAuthenticated: false,
      };
      setEvmWallet(wallet);
      setActiveChain('cronos');

      
      if (evmListenerRef.current) evmListenerRef.current();
      const onAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          setEvmWallet(null);
        } else {
          setEvmWallet((prev) => prev ? { ...prev, address: accounts[0] } : null);
        }
      };
      const onChainChanged = (chainId: string) => {
        setEvmWallet((prev) => prev ? { ...prev, chainId: parseInt(chainId, 16) } : null);
      };
      provider.on('accountsChanged', onAccountsChanged);
      provider.on('chainChanged', onChainChanged);
      evmListenerRef.current = () => {
        provider.removeListener('accountsChanged', onAccountsChanged);
        provider.removeListener('chainChanged', onChainChanged);
      };

      return wallet;
    } finally {
      setIsConnectingEVM(false);
    }
  }, []);

  const disconnectEVM = useCallback(() => {
    if (evmListenerRef.current) { evmListenerRef.current(); evmListenerRef.current = null; }
    setEvmWallet(null);
    if (activeChain === 'cronos') {
      clearAuthToken();
      setAuthToken(null);
    }
  }, [activeChain]);

  

  const connectSolana = useCallback(async (): Promise<ConnectedWallet> => {
    const solana = (window as any).solana;
    if (!solana) {
      
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      const appUrl = encodeURIComponent(window.location.href);
      if (isMobile) {
        window.location.href = `https://phantom.app/ul/browse/${appUrl}?ref=${appUrl}`;
        
        return new Promise(() => {});
      }
      throw new Error('Phantom wallet not found. Please install Phantom from https://phantom.app');
    }
    setIsConnectingSolana(true);

    try {
      const resp = await solana.connect();
      const address = resp.publicKey.toString();

      const wallet: ConnectedWallet = {
        address,
        chain: 'solana',
        walletType: 'phantom',
        cluster: 'mainnet-beta',
        isAuthenticated: false,
      };
      setSolanaWallet(wallet);
      setActiveChain('solana');

      
      if (solanaListenerRef.current) solanaListenerRef.current();
      const onAccountChanged = (publicKey: any) => {
        if (!publicKey) {
          setSolanaWallet(null);
        } else {
          setSolanaWallet((prev) => prev ? { ...prev, address: publicKey.toString() } : null);
        }
      };
      solana.on('accountChanged', onAccountChanged);
      const onDisconnect = () => setSolanaWallet(null);
      solana.on('disconnect', onDisconnect);
      solanaListenerRef.current = () => {
        solana.off('accountChanged', onAccountChanged);
        solana.off('disconnect', onDisconnect);
      };

      return wallet;
    } finally {
      setIsConnectingSolana(false);
    }
  }, []);

  const disconnectSolana = useCallback(async () => {
    if (solanaListenerRef.current) { solanaListenerRef.current(); solanaListenerRef.current = null; }
    const solana = (window as any).solana;
    if (solana) { try { await solana.disconnect(); } catch {} }
    setSolanaWallet(null);
    if (activeChain === 'solana') {
      clearAuthToken();
      setAuthToken(null);
    }
  }, [activeChain]);

  const disconnectAll = useCallback(() => {
    disconnectEVM();
    disconnectSolana();
    clearAuthToken();
    setAuthToken(null);
  }, [disconnectEVM, disconnectSolana]);

  

  
  const authenticateWallet = useCallback(async (chain: SupportedChain): Promise<string> => {
    if (chain === 'cronos') {
      const wallet = evmWallet;
      if (!wallet) throw new Error('No EVM wallet connected');

      const { ethers } = await import('ethers');
      const browserProvider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await browserProvider.getSigner();

      
      const nonceRes = await fetch(`/api/auth/nonce?address=${wallet.address}`);
      if (!nonceRes.ok) throw new Error('Failed to get nonce');
      const { message } = await nonceRes.json();

      
      const signature = await signer.signMessage(message);

      
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: wallet.address, signature, message, chainId: wallet.chainId }),
      });
      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}));
        throw new Error(err.error ?? 'EVM auth failed');
      }
      const { token } = await verifyRes.json();
      saveAuthToken(token);
      setAuthToken(token);
      setEvmWallet((prev) => prev ? { ...prev, isAuthenticated: true } : null);
      return token;

    } else {
      
      const wallet = solanaWallet;
      if (!wallet) throw new Error('No Solana wallet connected');
      const solana = (window as any).solana;
      if (!solana) throw new Error('Phantom not available');

      
      const nonceRes = await fetch(`/api/auth/solana/nonce?address=${wallet.address}`);
      if (!nonceRes.ok) throw new Error('Failed to get Solana nonce');
      const { message } = await nonceRes.json();

      
      const encoded = new TextEncoder().encode(message);
      const { signature } = await solana.signMessage(encoded, 'utf8');
      const signatureBase64 = btoa(String.fromCharCode(...signature));

      
      const verifyRes = await fetch('/api/auth/solana/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: wallet.address, signature: signatureBase64, message }),
      });
      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}));
        throw new Error(err.error ?? 'Solana auth failed');
      }
      const { token } = await verifyRes.json();
      saveAuthToken(token);
      setAuthToken(token);
      setSolanaWallet((prev) => prev ? { ...prev, isAuthenticated: true } : null);
      return token;
    }
  }, [evmWallet, solanaWallet]);

  const getActiveWallet = useCallback((): ConnectedWallet | null => {
    return activeChain === 'solana' ? solanaWallet : evmWallet;
  }, [activeChain, solanaWallet, evmWallet]);

  

  useEffect(() => {
    
    if ((window as any).ethereum) {
      (window as any).ethereum.request({ method: 'eth_accounts' })
        .then(async (accounts: string[]) => {
          if (accounts.length > 0) {
            try { await connectEVM(); } catch {}
          }
        })
        .catch(() => {});
    }

    
    const solana = (window as any).solana;
    if (solana?.isPhantom) {
      solana.connect({ onlyIfTrusted: true })
        .then(async (resp: any) => {
          if (resp?.publicKey) {
            const address = resp.publicKey.toString();
            setSolanaWallet({ address, chain: 'solana', walletType: 'phantom', cluster: 'mainnet-beta', isAuthenticated: false });
          }
        })
        .catch(() => {});
    }

    return () => {
      if (evmListenerRef.current) evmListenerRef.current();
      if (solanaListenerRef.current) solanaListenerRef.current();
    };
  
  }, []);

  return {
    evmWallet,
    solanaWallet,
    activeChain,
    isConnectingEVM,
    isConnectingSolana,
    authToken,
    hasMetaMask,
    hasPhantom,
    connectEVM,
    connectSolana,
    disconnectEVM,
    disconnectSolana,
    disconnectAll,
    setActiveChain,
    authenticateWallet,
    getActiveWallet,
  };
}



function detectEVMType(provider: any): WalletType {
  if (provider.isMetaMask) return 'metamask';
  if (provider.isCryptoCom || provider.isCDCWallet) return 'cryptocom';
  if (provider.isCoinbaseWallet || provider.isCoinbaseBrowser) return 'coinbase';
  return 'injected';
}
