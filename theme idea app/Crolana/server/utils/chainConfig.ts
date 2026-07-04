

export type NetworkEnv = 'mainnet' | 'testnet' | 'devnet';

export interface CronosConfig {
  activeNetwork: NetworkEnv;
  rpc:           string;
  wsRpc:         string;
  chainId:       number;
  explorerUrl:   string;
  isTestnet:     boolean;
  cronoscanKey:  string | null;
  covalentKey:   string | null;
  moralisKey:    string | null;
}

export interface SolanaConfig {
  activeCluster: 'mainnet' | 'devnet';
  rpc:           string;
  devnetRpc:     string;
  explorerUrl:   string;
  isDevnet:      boolean;
  heliusKey:     string | null;
  heliusRpc:     string | null;
  tensorKey:     string | null;
}



const CRONOS_ACTIVE = (process.env.CRONOS_ACTIVE_NETWORK ?? 'mainnet') as NetworkEnv;

export const cronosConfig: CronosConfig = {
  activeNetwork: CRONOS_ACTIVE,
  rpc: CRONOS_ACTIVE === 'testnet'
    ? (process.env.CRONOS_TESTNET_RPC ?? 'https://cronos-testnet.drpc.org')
    : (process.env.CRONOS_MAINNET_RPC ?? 'https://evm.cronos.org'),
  wsRpc: CRONOS_ACTIVE === 'testnet'
    ? (process.env.CRONOS_WS_TESTNET ?? 'wss://cronos-testnet.drpc.org')
    : (process.env.CRONOS_WS_MAINNET ?? 'wss://ws.cronos.org'),
  chainId:      CRONOS_ACTIVE === 'testnet' ? 338 : 25,
  explorerUrl:  CRONOS_ACTIVE === 'testnet'
    ? 'https://explorer.cronos.org/testnet'
    : 'https://explorer.cronos.org',
  isTestnet:    CRONOS_ACTIVE === 'testnet',
  cronoscanKey: process.env.CRONOSCAN_API_KEY || null,
  covalentKey:  process.env.COVALENT_API_KEY  || null,
  moralisKey:   process.env.MORALIS_API_KEY   || null,
};



const SOLANA_ACTIVE = (process.env.SOLANA_ACTIVE_CLUSTER ?? 'mainnet') as 'mainnet' | 'devnet';
const HELIUS_KEY    = process.env.HELIUS_API_KEY || null;

export const solanaConfig: SolanaConfig = {
  activeCluster: SOLANA_ACTIVE,
  rpc: SOLANA_ACTIVE === 'devnet'
    ? (process.env.SOLANA_DEVNET_RPC ?? 'https://api.devnet.solana.com')
    : (process.env.SOLANA_MAINNET_RPC ?? 'https://rpc.ankr.com/solana'),
  devnetRpc: process.env.SOLANA_DEVNET_RPC ?? 'https://api.devnet.solana.com',
  explorerUrl:  SOLANA_ACTIVE === 'devnet'
    ? 'https://solscan.io/?cluster=devnet'
    : 'https://solscan.io',
  isDevnet:     SOLANA_ACTIVE === 'devnet',
  heliusKey:    HELIUS_KEY,
  heliusRpc:    HELIUS_KEY
    ? (SOLANA_ACTIVE === 'devnet'
        ? `https://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
        : `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`)
    : null,
  tensorKey:    process.env.TENSOR_API_KEY   || null,
};



export type SupportedChain = 'cronos' | 'solana';

export function getChainConfig(chain: SupportedChain): CronosConfig | SolanaConfig {
  return chain === 'cronos' ? cronosConfig : solanaConfig;
}


export function getActiveRpc(chain: SupportedChain): string {
  return chain === 'cronos' ? cronosConfig.rpc : solanaConfig.rpc;
}


export function getExplorerUrl(chain: SupportedChain, txHash: string): string {
  if (chain === 'cronos') return `${cronosConfig.explorerUrl}/tx/${txHash}`;
  return `${solanaConfig.explorerUrl}/tx/${txHash}`;
}


export function logChainConfig(): void {
  const mask = (s: string | null) => s ? `${s.slice(0, 6)}…` : 'not set';
  console.log('[chainConfig] Cronos:', {
    network:   cronosConfig.activeNetwork,
    chainId:   cronosConfig.chainId,
    rpc:       cronosConfig.rpc.slice(0, 40),
    covalent:  mask(cronosConfig.covalentKey),
  });
  console.log('[chainConfig] Solana:', {
    cluster:   solanaConfig.activeCluster,
    rpc:       solanaConfig.rpc.slice(0, 40),
    helius:    mask(solanaConfig.heliusKey),
  });
}
