

import { ethers } from 'ethers';





export interface CompilationResult {
  abi: any[];
  bytecode: string;
  source: string;
  contractName: string;
  warnings?: string[];
}

export interface DeploymentConfig {
  name: string;
  symbol: string;
  baseURI: string;
  hiddenMetadataUri: string;
}

export interface DeploymentResult {
  address: string;
  txHash: string;
  chainId: number;
  contractName: string;
  contractType: string;
  deployerAddress: string;
  explorerUrl: string;
  timestamp: number;
  abi: any[];
  gasUsed?: bigint;
}

export interface SavedDeployment extends DeploymentResult {
  id: string;
  collectionName: string;
  network: string;
}





export async function generateContractSource(config: any, authToken?: string): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;

  const res = await fetch('/api/contract/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify({ config }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Generation failed' }));
    throw new Error(err.error || 'Contract generation failed');
  }

  const data = await res.json();
  return data.source;
}





export async function compileContract(
  source: string,
  contractName: string,
  authToken?: string,
): Promise<CompilationResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;

  const res = await fetch('/api/contract/compile', {
    method: 'POST',
    headers,
    body: JSON.stringify({ source, contractName }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Compilation failed' }));
    throw new Error(err.error || 'Compilation failed. Check your contract configuration.');
  }

  const data = await res.json();

  if (!data.abi || !data.bytecode) {
    throw new Error(data.error || 'Compilation produced no output');
  }

  return {
    abi: data.abi,
    bytecode: data.bytecode,
    source,
    contractName,
    warnings: data.warnings,
  };
}





export async function deployNFTContract(
  signer: ethers.JsonRpcSigner,
  compiled: CompilationResult,
  deployConfig: DeploymentConfig,
  chainId: number,
  onStatus?: (status: string) => void,
): Promise<DeploymentResult> {
  onStatus?.('Preparing deployment transaction…');

  const factory = new ethers.ContractFactory(compiled.abi, compiled.bytecode, signer);
  const deployerAddress = await signer.getAddress();

  
  onStatus?.('Requesting wallet signature…');
  const contract = await factory.deploy(
    deployConfig.name,
    deployConfig.symbol,
    deployConfig.baseURI,
    deployConfig.hiddenMetadataUri,
  );

  onStatus?.('Transaction submitted, waiting for confirmation…');
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  if (!deployTx) throw new Error('No deployment transaction found');

  onStatus?.('Waiting for block confirmation…');
  const receipt = await deployTx.wait(1);
  if (!receipt || receipt.status === 0) throw new Error('Deployment transaction reverted');

  const explorerBase = chainId === 338
    ? 'https://explorer.cronos.org/testnet'
    : 'https://explorer.cronos.org';

  onStatus?.('Contract deployed successfully!');

  return {
    address,
    txHash: receipt.hash,
    chainId,
    contractName: compiled.contractName,
    contractType: detectContractType(compiled.abi),
    deployerAddress,
    explorerUrl: `${explorerBase}/address/${address}`,
    timestamp: Date.now(),
    abi: compiled.abi,
    gasUsed: receipt.gasUsed,
  };
}





export async function estimateDeploymentGas(
  provider: ethers.BrowserProvider,
  compiled: CompilationResult,
  deployConfig: DeploymentConfig,
): Promise<{ gasEstimate: bigint; gasPriceGwei: string; estimatedCostCRO: string }> {
  const [feeData, gasEstimate] = await Promise.all([
    provider.getFeeData(),
    (async () => {
      const factory = new ethers.ContractFactory(compiled.abi, compiled.bytecode);
      const deployTx = await factory.getDeployTransaction(
        deployConfig.name,
        deployConfig.symbol,
        deployConfig.baseURI,
        deployConfig.hiddenMetadataUri,
      );
      return provider.estimateGas({ data: deployTx.data });
    })(),
  ]);

  const gasPrice = feeData.gasPrice ?? 5000000000n;
  const cost = gasEstimate * gasPrice;

  return {
    gasEstimate,
    gasPriceGwei: ethers.formatUnits(gasPrice, 'gwei'),
    estimatedCostCRO: ethers.formatEther(cost),
  };
}





const STORAGE_KEY = 'crolana-deployments';

export function saveDeploymentLocally(result: DeploymentResult, collectionName: string): void {
  const saved: SavedDeployment = {
    ...result,
    id: `${result.txHash.slice(0, 8)}-${Date.now()}`,
    collectionName,
    network: result.chainId === 338 ? 'testnet' : 'mainnet',
  };

  try {
    const existing: SavedDeployment[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    existing.unshift(saved);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing.slice(0, 50)));
  } catch {
    
  }
}

export function getLocalDeployments(): SavedDeployment[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearLocalDeployments(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}





export async function saveDeploymentToServer(
  result: DeploymentResult,
  collectionName: string,
  authToken?: string,
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;

  await fetch('/api/contract/deployments', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...result, collectionName }),
  }).catch(() => {}); 
}





export async function verifyOnExplorer(
  contractAddress: string,
  source: string,
  contractName: string,
  chainId: number,
): Promise<{ success: boolean; message: string }> {
  const res = await fetch('/api/contract/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: contractAddress, source, contractName, chainId }),
  });

  if (!res.ok) return { success: false, message: 'Verification request failed' };
  const data = await res.json();
  return { success: data.success ?? false, message: data.message ?? 'Unknown result' };
}





function detectContractType(abi: any[]): string {
  const fns = new Set(abi.filter((x) => x.type === 'function').map((x) => x.name));
  if (fns.has('uri') && fns.has('balanceOf')) return 'ERC1155';
  if (fns.has('tokenURI')) return 'ERC721';
  if (fns.has('totalSupply') && !fns.has('tokenURI')) return 'ERC20';
  return 'Unknown';
}

export function getExplorerUrl(chainId: number, type: 'tx' | 'address', hash: string): string {
  const base = chainId === 338 ? 'https://explorer.cronos.org/testnet' : 'https://explorer.cronos.org';
  return `${base}/${type}/${hash}`;
}





export async function fullDeployPipeline(
  signer: ethers.JsonRpcSigner,
  contractConfig: any,
  deployConfig: DeploymentConfig,
  chainId: number,
  collectionName: string,
  onStatus?: (stage: string, progress?: number) => void,
  authToken?: string,
): Promise<DeploymentResult> {
  onStatus?.('Generating contract source…', 10);
  const source = await generateContractSource(contractConfig, authToken);

  const cName = (contractConfig.name || 'MyNFT').replace(/\s+/g, '');

  onStatus?.('Compiling contract…', 30);
  const compiled = await compileContract(source, cName, authToken);

  onStatus?.('Deploying to Cronos…', 60);
  const result = await deployNFTContract(signer, compiled, deployConfig, chainId, (s) => onStatus?.(s, 75));

  onStatus?.('Saving deployment record…', 90);
  saveDeploymentLocally(result, collectionName);
  await saveDeploymentToServer(result, collectionName, authToken);

  onStatus?.('Done!', 100);
  return result;
}
