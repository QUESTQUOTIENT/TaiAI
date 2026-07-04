

import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  connectWallet, switchNetwork, onAccountChange, onChainChange,
  getAuthNonce, verifyAuth, saveAuthToken, clearAuthToken, getStoredAuthToken,
  isWalletAvailable, type WalletType, type WalletInfo,
} from '../wallet/walletManager';
import { useAppStore } from '../store';

export function useWallet() {
  const { walletAddress, network, setWalletAddress, addNotification } = useAppStore();
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  
  useEffect(() => {
    const token = getStoredAuthToken();
    if (token) {
      fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
        .then((r) => r.json())
        .then((d) => { if (d.authenticated) setIsAuthenticated(true); })
        .catch(() => {});
    }
  }, []);

  
  useEffect(() => {
    const offAccount = onAccountChange((accounts) => {
      if (accounts.length === 0) {
        disconnect();
      } else if (walletInfo) {
        setWalletAddress(accounts[0]);
        setWalletInfo((prev) => prev ? { ...prev, address: accounts[0] } : null);
      }
    });

    const offChain = onChainChange((chainIdHex) => {
      const chainId = parseInt(chainIdHex, 16);
      if (walletInfo) setWalletInfo((prev) => prev ? { ...prev, chainId } : null);
      
      if (chainId !== network.chainId) {
        addNotification({ type: 'warning', title: 'Network Changed', message: 'You switched networks. Some features may not work.', duration: 5000 });
      }
    });

    return () => { offAccount(); offChain(); };
  }, [walletInfo, network.chainId]);

  const connect = useCallback(async (walletType?: WalletType) => {
    if (!isWalletAvailable()) {
      setError('No Web3 wallet detected. Install MetaMask or Crypto.com DeFi Wallet.');
      return null;
    }
    setIsConnecting(true);
    setError(null);
    try {
      const info = await connectWallet(walletType);
      setWalletInfo(info);
      setWalletAddress(info.address);
      addNotification({ type: 'success', title: 'Wallet Connected', message: info.address.slice(0, 6) + '…' + info.address.slice(-4) + ' connected', duration: 3000 });
      return info;
    } catch (err: any) {
      const msg = err.message || 'Connection failed';
      setError(msg);
      addNotification({ type: 'error', title: 'Connection Failed', message: msg, duration: 5000 });
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, [setWalletAddress, addNotification]);

  const authenticate = useCallback(async () => {
    if (!walletInfo) throw new Error('Connect wallet first');
    setIsAuthenticating(true);
    try {
      const { message } = await getAuthNonce(walletInfo.address);
      const signature = await walletInfo.signer.signMessage(message);
      const { token } = await verifyAuth(walletInfo.address, signature, message);
      saveAuthToken(token);
      setIsAuthenticated(true);
      addNotification({ type: 'success', title: 'Signed In', message: 'Wallet authentication successful', duration: 3000 });
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Auth Failed', message: err.message, duration: 5000 });
      throw err;
    } finally {
      setIsAuthenticating(false);
    }
  }, [walletInfo, addNotification]);

  const disconnect = useCallback(() => {
    setWalletInfo(null);
    setWalletAddress(null);
    setIsAuthenticated(false);
    clearAuthToken();
    addNotification({ type: 'info', title: 'Disconnected', message: 'Wallet disconnected', duration: 2000 });
  }, [setWalletAddress, addNotification]);

  const ensureNetwork = useCallback(async (requiredChainId: number) => {
    if (!walletInfo) throw new Error('Wallet not connected');
    if (walletInfo.chainId !== requiredChainId) {
      await switchNetwork(requiredChainId);
    }
  }, [walletInfo]);

  const getSigner = useCallback(async (): Promise<ethers.JsonRpcSigner> => {
    if (walletInfo?.signer) return walletInfo.signer;
    if (!(window as any).ethereum) throw new Error('No wallet available');
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    return provider.getSigner();
  }, [walletInfo]);

  return {
    walletInfo,
    walletAddress,
    isConnected: !!walletAddress,
    isConnecting,
    isAuthenticating,
    isAuthenticated,
    error,
    connect,
    authenticate,
    disconnect,
    ensureNetwork,
    getSigner,
    chainId: walletInfo?.chainId ?? network.chainId,
    balance: walletInfo?.balance ?? '0',
  };
}
