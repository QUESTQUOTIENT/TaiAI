

import { ethers } from 'ethers';

export interface WalletInfo {
  address: string;
  chainId: number;
  balance: string;
  provider: ethers.BrowserProvider;
  signer: ethers.JsonRpcSigner;
  walletType: WalletType;
}

export type WalletType = 'metamask' | 'cryptocom' | 'coinbase' | 'trust' | 'injected';

export interface NetworkParams {
  chainId: string;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls: string[];
}

export const CRONOS_NETWORKS: Record<number, NetworkParams> = {
  25: {
    chainId: '0x19',
    chainName: 'Cronos Mainnet',
    nativeCurrency: { name: 'Cronos', symbol: 'CRO', decimals: 18 },
    rpcUrls: ['https://evm.cronos.org'],
    blockExplorerUrls: ['https://explorer.cronos.org'],
  },
  338: {
    chainId: '0x152',
    chainName: 'Cronos Testnet',
    nativeCurrency: { name: 'Test Cronos', symbol: 'TCRO', decimals: 18 },
    rpcUrls: ['https://evm-t3.cronos.org'],
    blockExplorerUrls: ['https://explorer.cronos.org/testnet'],
  },
};

export function detectWalletType(): WalletType | null {
  if (typeof window === 'undefined' || !(window as any).ethereum) return null;
  if ((window as any).ethereum.isMetaMask) return 'metamask';
  if ((window as any).ethereum.isCryptoCom || (window as any).ethereum.isCDCWallet) return 'cryptocom';
  if ((window as any).ethereum.isCoinbaseWallet || (window as any).ethereum.isCoinbaseBrowser) return 'coinbase';
  if ((window as any).ethereum.isTrust) return 'trust';
  return 'injected';
}

export function isWalletAvailable(): boolean {
  return typeof window !== 'undefined' && !!(window as any).ethereum;
}

export async function connectWallet(preferredType?: WalletType): Promise<WalletInfo> {
  if (!(window as any).ethereum) {
    throw new Error('No wallet detected. Please install MetaMask or Crypto.com DeFi Wallet.');
  }

  let ethereum = (window as any).ethereum;

  if ((window as any).ethereum.providers && Array.isArray((window as any).ethereum.providers)) {
    const providers = (window as any).ethereum.providers as any[];
    if (preferredType === 'metamask') ethereum = providers.find((p) => p.isMetaMask) ?? ethereum;
    else if (preferredType === 'cryptocom') ethereum = providers.find((p) => p.isCryptoCom || p.isCDCWallet) ?? ethereum;
    else if (preferredType === 'coinbase') ethereum = providers.find((p) => p.isCoinbaseWallet) ?? ethereum;
  }

  const browserProvider = new ethers.BrowserProvider(ethereum);
  await browserProvider.send('eth_requestAccounts', []);
  const signer = await browserProvider.getSigner();
  const address = await signer.getAddress();
  const network = await browserProvider.getNetwork();
  const chainId = Number(network.chainId);
  const balanceWei = await browserProvider.getBalance(address);
  const balance = ethers.formatEther(balanceWei);
  const walletType = detectWalletType() ?? 'injected';

  return { address, chainId, balance, provider: browserProvider, signer, walletType };
}

export async function switchNetwork(chainId: number): Promise<void> {
  if (!(window as any).ethereum) throw new Error('No wallet connected');
  const networkParams = CRONOS_NETWORKS[chainId];
  if (!networkParams) throw new Error('Unsupported network: ' + chainId);
  try {
    await (window as any).ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: networkParams.chainId }] });
  } catch (err: any) {
    if (err.code === 4902 || err.message?.includes('Unrecognized chain')) {
      await (window as any).ethereum.request({ method: 'wallet_addEthereumChain', params: [networkParams] });
    } else throw err;
  }
}

export async function signMessage(signer: ethers.JsonRpcSigner, message: string): Promise<string> {
  return signer.signMessage(message);
}

export async function deployContract(
  signer: ethers.JsonRpcSigner,
  abi: any[],
  bytecode: string,
  args: any[],
): Promise<{ address: string; txHash: string }> {
  const factory = new ethers.ContractFactory(abi, bytecode, signer);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  if (!deployTx) throw new Error('No deployment transaction');
  const receipt = await deployTx.wait();
  if (!receipt) throw new Error('No receipt');
  return { address, txHash: receipt.hash };
}

export function onAccountChange(callback: (accounts: string[]) => void): () => void {
  if (!(window as any).ethereum) return () => {};
  (window as any).ethereum.on('accountsChanged', callback);
  return () => (window as any).ethereum?.removeListener('accountsChanged', callback);
}

export function onChainChange(callback: (chainId: string) => void): () => void {
  if (!(window as any).ethereum) return () => {};
  (window as any).ethereum.on('chainChanged', callback);
  return () => (window as any).ethereum?.removeListener('chainChanged', callback);
}

const ERC20_APPROVE_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

export async function checkApproval(signer: ethers.JsonRpcSigner, tokenAddress: string, spenderAddress: string, requiredAmount: bigint): Promise<{ needsApproval: boolean; currentAllowance: bigint }> {
  const token = new ethers.Contract(tokenAddress, ERC20_APPROVE_ABI, signer);
  const owner = await signer.getAddress();
  const currentAllowance: bigint = await token.allowance(owner, spenderAddress);
  return { needsApproval: currentAllowance < requiredAmount, currentAllowance };
}

export async function approveToken(signer: ethers.JsonRpcSigner, tokenAddress: string, spenderAddress: string, amount: bigint): Promise<string> {
  const token = new ethers.Contract(tokenAddress, ERC20_APPROVE_ABI, signer);
  const tx = await token.approve(spenderAddress, amount);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function getAuthNonce(address: string): Promise<{ nonce: string; message: string }> {
  const res = await fetch('/api/auth/nonce?address=' + address);
  if (!res.ok) throw new Error('Failed to get auth nonce');
  return res.json();
}

export async function verifyAuth(address: string, signature: string, message: string): Promise<{ token: string }> {
  const res = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, signature, message }),
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Auth failed'); }
  return res.json();
}

export function saveAuthToken(token: string): void { try { localStorage.setItem('crolana-token', token); } catch {} }
export function clearAuthToken(): void { try { localStorage.removeItem('crolana-token'); } catch {} }
export function getStoredAuthToken(): string | null { try { return localStorage.getItem('crolana-token'); } catch { return null; } }
