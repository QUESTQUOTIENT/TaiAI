

import { ethers } from 'ethers';
import { MerkleTree } from 'merkletreejs';
import { keccak256 } from 'ethers';





export const MINT_ABI = [
  
  'function totalSupply() view returns (uint256)',
  'function maxSupply() view returns (uint256)',
  'function cost() view returns (uint256)',
  'function paused() view returns (bool)',
  'function revealed() view returns (bool)',
  'function maxMintAmountPerTx() view returns (uint256)',
  'function maxMintAmountPerWallet() view returns (uint256)',
  'function mintedByWallet(address) view returns (uint256)',
  'function merkleRoot() view returns (bytes32)',
  'function owner() view returns (address)',
  'function balanceOf(address) view returns (uint256)',
  'function contractURI() view returns (string)',
  'function baseURI() view returns (string)',
  'function hiddenMetadataUri() view returns (string)',
  
  'function mint(uint256 amount) payable',
  'function allowlistMint(uint256 amount, bytes32[] calldata proof) payable',
  'function ownerMint(address to, uint256 amount)',
  'function reveal(string memory newBaseURI)',
  'function setBaseURI(string memory uri)',
  'function setHiddenMetadataUri(string memory uri)',
  'function setCost(uint256 newCost)',
  'function setMaxMintAmountPerTx(uint256 newMax)',
  'function setMaxMintAmountPerWallet(uint256 newMax)',
  'function setPaused(bool state)',
  'function setMerkleRoot(bytes32 root)',
  'function setContractURI(string memory uri)',
  'function setDefaultRoyalty(address receiver, uint96 feeNumerator)',
  'function withdraw() payable',
];

export const ERC1155_MINT_ABI = [
  'function totalMinted() view returns (uint256)',
  'function maxSupply() view returns (uint256)',
  'function cost() view returns (uint256)',
  'function paused() view returns (bool)',
  'function mintedByWallet(address) view returns (uint256)',
  'function owner() view returns (address)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function mint(address to, uint256 id, uint256 amount, bytes calldata data) payable',
  'function mintBatch(address to, uint256[] calldata ids, uint256[] calldata amounts, bytes calldata data) payable',
  'function ownerMint(address to, uint256 id, uint256 amount)',
  'function setCost(uint256 newCost)',
  'function setPaused(bool state)',
  'function setBaseURI(string memory newURI)',
  'function withdraw() payable',
];





export interface ContractState {
  totalSupply: number;
  maxSupply: number;
  cost: bigint;
  costFormatted: string;
  paused: boolean;
  revealed: boolean;
  maxPerTx: number;
  maxPerWallet: number;
  mintedByUser: number;
  ownerAddress: string;
  balance: bigint;
  balanceFormatted: string;
  contractURI: string;
  baseURI: string;
  hiddenURI: string;
  merkleRoot: string;
}

export interface MintResult {
  txHash: string;
  tokenIds: number[];
  amountMinted: number;
  totalCost: bigint;
  explorerUrl: string;
}

export interface AirdropResult {
  txHash: string;
  recipients: number;
  totalMinted: number;
  explorerUrl: string;
}

export type MintPhaseType = 'allowlist' | 'public' | 'owner';





function explorerUrl(chainId: number, hash: string): string {
  const base = chainId === 338 ? 'https://explorer.cronos.org/testnet' : 'https://explorer.cronos.org';
  return `${base}/tx/${hash}`;
}

function getContract(address: string, signer: ethers.JsonRpcSigner, is1155 = false) {
  return new ethers.Contract(address, is1155 ? ERC1155_MINT_ABI : MINT_ABI, signer);
}

function getContractRO(address: string, provider: ethers.BrowserProvider | ethers.JsonRpcProvider, is1155 = false) {
  return new ethers.Contract(address, is1155 ? ERC1155_MINT_ABI : MINT_ABI, provider);
}





export async function readContractState(
  provider: ethers.BrowserProvider | ethers.JsonRpcProvider,
  contractAddress: string,
  userAddress?: string,
  is1155 = false,
): Promise<ContractState> {
  const contract = getContractRO(contractAddress, provider, is1155);

  const reads = await Promise.allSettled([
    is1155 ? contract.totalMinted() : contract.totalSupply(),
    contract.maxSupply(),
    contract.cost(),
    contract.paused(),
    is1155 ? Promise.resolve(false) : contract.revealed(),
    is1155 ? Promise.resolve(0n) : contract.maxMintAmountPerTx(),
    is1155 ? Promise.resolve(0n) : contract.maxMintAmountPerWallet(),
    userAddress ? (is1155 ? Promise.resolve(0n) : contract.mintedByWallet(userAddress)) : Promise.resolve(0n),
    contract.owner(),
    provider.getBalance(contractAddress),
    is1155 ? Promise.resolve('') : contract.contractURI().catch(() => ''),
    is1155 ? Promise.resolve('') : contract.baseURI().catch(() => ''),
    is1155 ? Promise.resolve('') : contract.hiddenMetadataUri().catch(() => ''),
    is1155 ? Promise.resolve(ethers.ZeroHash) : contract.merkleRoot().catch(() => ethers.ZeroHash),
  ]);

  const safe = <T>(r: PromiseSettledResult<T>, fallback: T): T =>
    r.status === 'fulfilled' ? r.value : fallback;

  const totalSupply = Number(safe(reads[0], 0n));
  const maxSupply = Number(safe(reads[1], 0n));
  const cost = safe(reads[2], 0n) as bigint;
  const paused = safe(reads[3], false) as boolean;
  const revealed = safe(reads[4], false) as boolean;
  const maxPerTx = Number(safe(reads[5], 0n));
  const maxPerWallet = Number(safe(reads[6], 0n));
  const mintedByUser = Number(safe(reads[7], 0n));
  const ownerAddress = safe(reads[8], '') as string;
  const balance = safe(reads[9], 0n) as bigint;

  return {
    totalSupply, maxSupply, cost,
    costFormatted: ethers.formatEther(cost),
    paused, revealed, maxPerTx, maxPerWallet, mintedByUser,
    ownerAddress,
    balance,
    balanceFormatted: ethers.formatEther(balance),
    contractURI: safe(reads[10], '') as string,
    baseURI: safe(reads[11], '') as string,
    hiddenURI: safe(reads[12], '') as string,
    merkleRoot: safe(reads[13], ethers.ZeroHash) as string,
  };
}





export async function publicMint(
  signer: ethers.JsonRpcSigner,
  contractAddress: string,
  amount: number,
  costPerToken: bigint,
  chainId: number,
): Promise<MintResult> {
  const contract = getContract(contractAddress, signer);
  const totalCost = costPerToken * BigInt(amount);

  const tx = await contract.mint(amount, { value: totalCost });
  const receipt = await tx.wait();
  if (!receipt || receipt.status === 0) throw new Error('Mint transaction reverted');

  
  const transferSig = ethers.id('Transfer(address,address,uint256)');
  const tokenIds = receipt.logs
    .filter((l: any) => l.topics[0] === transferSig)
    .map((l: any) => Number(l.topics[3]));

  return {
    txHash: receipt.hash,
    tokenIds,
    amountMinted: amount,
    totalCost,
    explorerUrl: explorerUrl(chainId, receipt.hash),
  };
}





export async function allowlistMint(
  signer: ethers.JsonRpcSigner,
  contractAddress: string,
  amount: number,
  costPerToken: bigint,
  merkleProof: string[],
  chainId: number,
): Promise<MintResult> {
  const contract = getContract(contractAddress, signer);
  const totalCost = costPerToken * BigInt(amount);

  const tx = await contract.allowlistMint(amount, merkleProof, { value: totalCost });
  const receipt = await tx.wait();
  if (!receipt || receipt.status === 0) throw new Error('Allowlist mint reverted');

  const transferSig = ethers.id('Transfer(address,address,uint256)');
  const tokenIds = receipt.logs
    .filter((l: any) => l.topics[0] === transferSig)
    .map((l: any) => Number(l.topics[3]));

  return { txHash: receipt.hash, tokenIds, amountMinted: amount, totalCost, explorerUrl: explorerUrl(chainId, receipt.hash) };
}





export async function ownerMint(
  signer: ethers.JsonRpcSigner,
  contractAddress: string,
  recipient: string,
  amount: number,
  chainId: number,
): Promise<MintResult> {
  const contract = getContract(contractAddress, signer);
  const tx = await contract.ownerMint(recipient, amount);
  const receipt = await tx.wait();
  if (!receipt || receipt.status === 0) throw new Error('Owner mint reverted');

  const transferSig = ethers.id('Transfer(address,address,uint256)');
  const tokenIds = receipt.logs
    .filter((l: any) => l.topics[0] === transferSig)
    .map((l: any) => Number(l.topics[3]));

  return { txHash: receipt.hash, tokenIds, amountMinted: amount, totalCost: 0n, explorerUrl: explorerUrl(chainId, receipt.hash) };
}





export async function airdropNFTs(
  signer: ethers.JsonRpcSigner,
  contractAddress: string,
  recipients: { address: string; amount: number }[],
  chainId: number,
  onProgress?: (done: number, total: number) => void,
): Promise<AirdropResult[]> {
  const results: AirdropResult[] = [];

  for (let i = 0; i < recipients.length; i++) {
    const { address, amount } = recipients[i];
    const result = await ownerMint(signer, contractAddress, address, amount, chainId);
    results.push({ txHash: result.txHash, recipients: 1, totalMinted: amount, explorerUrl: result.explorerUrl });
    onProgress?.(i + 1, recipients.length);
  }

  return results;
}





export async function mint1155(
  signer: ethers.JsonRpcSigner,
  contractAddress: string,
  tokenId: number,
  amount: number,
  costPerToken: bigint,
  chainId: number,
): Promise<MintResult> {
  const contract = getContract(contractAddress, signer, true);
  const recipient = await signer.getAddress();
  const totalCost = costPerToken * BigInt(amount);

  const tx = await contract.mint(recipient, tokenId, amount, '0x', { value: totalCost });
  const receipt = await tx.wait();
  if (!receipt || receipt.status === 0) throw new Error('ERC1155 mint reverted');

  return { txHash: receipt.hash, tokenIds: [tokenId], amountMinted: amount, totalCost, explorerUrl: explorerUrl(chainId, receipt.hash) };
}





export async function revealCollection(
  signer: ethers.JsonRpcSigner,
  contractAddress: string,
  newBaseURI: string,
  chainId: number,
): Promise<string> {
  const contract = getContract(contractAddress, signer);
  const tx = await contract.reveal(newBaseURI);
  const receipt = await tx.wait();
  if (!receipt || receipt.status === 0) throw new Error('Reveal transaction reverted');
  return receipt.hash;
}





export async function withdrawFunds(
  signer: ethers.JsonRpcSigner,
  contractAddress: string,
  chainId: number,
): Promise<{ txHash: string; amount: string; explorerUrl: string }> {
  const contract = getContract(contractAddress, signer);
  const provider = signer.provider!;
  const balance = await provider.getBalance(contractAddress);
  const tx = await contract.withdraw();
  const receipt = await tx.wait();
  if (!receipt || receipt.status === 0) throw new Error('Withdraw failed');
  return { txHash: receipt.hash, amount: ethers.formatEther(balance), explorerUrl: explorerUrl(chainId, receipt.hash) };
}





export function buildMerkleTree(addresses: string[]): { root: string; tree: MerkleTree } {
  const cleaned = addresses.map((a) => a.trim().toLowerCase()).filter((a) => ethers.isAddress(a));
  const leaves = cleaned.map((a) => ethers.solidityPackedKeccak256(['address'], [a]));
  const tree = new MerkleTree(leaves, keccak256, { sort: true });
  const root = tree.getHexRoot();
  return { root, tree };
}

export function getMerkleProof(tree: MerkleTree, address: string): string[] {
  const leaf = ethers.solidityPackedKeccak256(['address'], [address.toLowerCase()]);
  return tree.getHexProof(leaf);
}

export function verifyMerkleProof(tree: MerkleTree, address: string): boolean {
  const leaf = ethers.solidityPackedKeccak256(['address'], [address.toLowerCase()]);
  return tree.verify(tree.getHexProof(leaf), leaf, tree.getRoot());
}





export async function updateContractSettings(
  signer: ethers.JsonRpcSigner,
  contractAddress: string,
  settings: {
    cost?: bigint;
    maxPerTx?: number;
    maxPerWallet?: number;
    paused?: boolean;
    merkleRoot?: string;
    baseURI?: string;
    hiddenURI?: string;
    contractURI?: string;
    royaltyReceiver?: string;
    royaltyBps?: number;
  },
  chainId: number,
): Promise<string[]> {
  const contract = getContract(contractAddress, signer);
  const txHashes: string[] = [];

  const send = async (method: string, args: any[]) => {
    const tx = await (contract as any)[method](...args);
    const receipt = await tx.wait();
    if (receipt?.hash) txHashes.push(receipt.hash);
  };

  if (settings.cost !== undefined) await send('setCost', [settings.cost]);
  if (settings.maxPerTx !== undefined) await send('setMaxMintAmountPerTx', [settings.maxPerTx]);
  if (settings.maxPerWallet !== undefined) await send('setMaxMintAmountPerWallet', [settings.maxPerWallet]);
  if (settings.paused !== undefined) await send('setPaused', [settings.paused]);
  if (settings.merkleRoot) await send('setMerkleRoot', [settings.merkleRoot]);
  if (settings.baseURI) await send('setBaseURI', [settings.baseURI]);
  if (settings.hiddenURI) await send('setHiddenMetadataUri', [settings.hiddenURI]);
  if (settings.contractURI) await send('setContractURI', [settings.contractURI]);
  if (settings.royaltyReceiver && settings.royaltyBps !== undefined) {
    await send('setDefaultRoyalty', [settings.royaltyReceiver, settings.royaltyBps]);
  }

  return txHashes;
}
