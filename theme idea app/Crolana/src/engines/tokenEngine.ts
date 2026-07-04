

import { ethers } from 'ethers';





export interface TokenConfig {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;       
  isMintable: boolean;       
  isBurnable: boolean;
  isPausable: boolean;
  hasPermit: boolean;        
  isGovernance: boolean;     
  hasTax: boolean;
  buyTaxBps: number;
  sellTaxBps: number;
  taxRecipient: string;
  maxSupply?: string;        
  maxWalletPercent: number;  
  maxTxPercent: number;      
  blacklistEnabled: boolean;
}

export interface TokenDeployResult {
  address: string;
  txHash: string;
  name: string;
  symbol: string;
  totalSupply: string;
  explorerUrl: string;
  chainId: number;
}

export interface CompiledToken {
  abi: any[];
  bytecode: string;
  source: string;
  contractName: string;
}





export async function generateAndCompileToken(config: TokenConfig): Promise<CompiledToken> {
  const source = generateTokenSource(config);
  const contractName = config.name.replace(/\s+/g, '') || 'CronosToken';

  const res = await fetch('/api/token/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, contractName }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Compilation failed');
  }

  const data = await res.json();
  return { abi: data.abi, bytecode: data.bytecode, source, contractName };
}





export async function deployToken(
  signer: ethers.JsonRpcSigner,
  compiled: CompiledToken,
  config: TokenConfig,
  chainId: number,
): Promise<TokenDeployResult> {
  const factory = new ethers.ContractFactory(compiled.abi, compiled.bytecode, signer);
  const deployerAddress = await signer.getAddress();
  const initialSupply = ethers.parseUnits(config.totalSupply || '0', config.decimals);

  let contract: ethers.BaseContract;

  
  if (config.isGovernance) {
    contract = await factory.deploy(config.name, config.symbol, initialSupply, deployerAddress);
  } else {
    contract = await factory.deploy(config.name, config.symbol, initialSupply);
  }

  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  if (!deployTx) throw new Error('No deployment transaction');
  const receipt = await deployTx.wait();
  if (!receipt || receipt.status === 0) throw new Error('Deployment reverted');

  const explorerBase = chainId === 338
    ? 'https://explorer.cronos.org/testnet'
    : 'https://explorer.cronos.org';

  return {
    address,
    txHash: receipt.hash,
    name: config.name,
    symbol: config.symbol,
    totalSupply: config.totalSupply,
    explorerUrl: `${explorerBase}/address/${address}`,
    chainId,
  };
}





export function generateTokenSource(config: TokenConfig): string {
  const {
    name, symbol, decimals, totalSupply, isMintable, isBurnable,
    isPausable, hasTax, buyTaxBps, sellTaxBps, taxRecipient,
    maxSupply, isGovernance, hasPermit, blacklistEnabled,
    maxWalletPercent, maxTxPercent,
  } = config;

  const contractName = name.replace(/\s+/g, '') || 'CronosToken';
  const imports: string[] = [
    '@openzeppelin/contracts/token/ERC20/ERC20.sol',
    '@openzeppelin/contracts/access/Ownable.sol',
    '@openzeppelin/contracts/utils/ReentrancyGuard.sol',
  ];
  const inheritance: string[] = ['ERC20', 'Ownable', 'ReentrancyGuard'];

  if (isBurnable) {
    imports.push('@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol');
    inheritance.push('ERC20Burnable');
  }
  if (isPausable) {
    imports.push('@openzeppelin/contracts/utils/Pausable.sol');
    imports.push('@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol');
    inheritance.push('ERC20Pausable');
  }
  if (hasPermit) {
    imports.push('@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol');
    inheritance.push('ERC20Permit');
  }
  if (isGovernance) {
    imports.push('@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol');
    if (!hasPermit) {
      imports.push('@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol');
      inheritance.push('ERC20Permit');
    }
    inheritance.push('ERC20Votes');
  }

  const maxSupplyLine = isMintable && maxSupply
    ? `    uint256 public maxTokenSupply = ${maxSupply} * 10 ** ${decimals};`
    : '';

  const maxWalletLine = maxWalletPercent < 100
    ? `    uint256 public maxWalletAmount = (${totalSupply} * 10 ** ${decimals} * ${maxWalletPercent}) / 100;`
    : '';

  const maxTxLine = maxTxPercent < 100
    ? `    uint256 public maxTxAmount = (${totalSupply} * 10 ** ${decimals} * ${maxTxPercent}) / 100;`
    : '';

  const taxLines = hasTax ? `
    uint256 public buyTaxBps = ${buyTaxBps};
    uint256 public sellTaxBps = ${sellTaxBps};
    address public taxRecipient = ${taxRecipient ? `address(${taxRecipient})` : 'address(0)'};
    mapping(address => bool) public isExcludedFromTax;
` : '';

  const blacklistLines = blacklistEnabled ? `
    mapping(address => bool) public blacklisted;
    event Blacklisted(address indexed account, bool status);
    function setBlacklist(address account, bool status) external onlyOwner {
        blacklisted[account] = status;
        emit Blacklisted(account, status);
    }
` : '';

  const blacklistCheck = blacklistEnabled
    ? `        require(!blacklisted[from] && !blacklisted[to], "Blacklisted address");`
    : '';

  const maxWalletCheck = maxWalletPercent < 100
    ? `        if (to != owner()) require(balanceOf(to) + value <= maxWalletAmount, "Exceeds max wallet");`
    : '';

  const maxTxCheck = maxTxPercent < 100
    ? `        require(value <= maxTxAmount, "Exceeds max tx");`
    : '';

  
  const overrides: string[] = ['ERC20'];
  if (isPausable) overrides.push('ERC20Pausable');
  if (isGovernance) overrides.push('ERC20Votes');
  const overrideStr = overrides.length > 1 ? `(${overrides.join(', ')})` : '';

  const taxLogic = hasTax ? `
        bool takeTax = !isExcludedFromTax[from] && !isExcludedFromTax[to] && from != address(0) && to != address(0);
        if (takeTax) {
            uint256 taxBps = from == address(this) ? sellTaxBps : buyTaxBps;
            if (taxBps > 0 && taxRecipient != address(0)) {
                uint256 taxAmount = (value * taxBps) / 10000;
                super._update(from, taxRecipient, taxAmount);
                value -= taxAmount;
            }
        }` : '';

  const updateOverride = (hasTax || isPausable || isGovernance || maxWalletPercent < 100 || maxTxPercent < 100 || blacklistEnabled)
    ? `
    function _update(address from, address to, uint256 value)
        internal override${overrideStr}
    {
        ${blacklistCheck}
        ${maxTxCheck}
        ${maxWalletCheck}
        ${taxLogic}
        super._update(from, to, value);
    }
` : '';

  const mintFunction = isMintable ? `
    function mint(address to, uint256 amount) external onlyOwner {
        ${maxSupply ? `require(totalSupply() + amount <= maxTokenSupply, "Exceeds max supply");` : ''}
        _mint(to, amount);
    }
` : '';

  const pauseFunctions = isPausable ? `
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
` : '';

  const taxFunctions = hasTax ? `
    function setTaxRecipient(address _recipient) external onlyOwner { taxRecipient = _recipient; }
    function setBuyTax(uint256 _bps) external onlyOwner { require(_bps <= 1000, "Max 10%"); buyTaxBps = _bps; }
    function setSellTax(uint256 _bps) external onlyOwner { require(_bps <= 1000, "Max 10%"); sellTaxBps = _bps; }
    function excludeFromTax(address account, bool excluded) external onlyOwner { isExcludedFromTax[account] = excluded; }
` : '';

  const govNonces = isGovernance ? `
    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
` : '';

  const constructorArgs = isGovernance
    ? `string memory _name, string memory _symbol, uint256 _initialSupply, address _initialOwner`
    : `string memory _name, string memory _symbol, uint256 _initialSupply`;

  const superCalls = [
    `ERC20(_name, _symbol)`,
    isGovernance || hasPermit ? `ERC20Permit(_name)` : null,
    `Ownable(msg.sender)`,
  ].filter(Boolean).join(' ');

  const decimalsOverride = decimals !== 18 ? `
    function decimals() public pure override returns (uint8) { return ${decimals}; }
` : '';

  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

${imports.map((i) => `import "${i}";`).join('\n')}

/**
 * @title ${name}
 * @symbol ${symbol}
 * @dev Generated by Crolana
 */
contract ${contractName} is ${inheritance.join(', ')} {
    ${maxSupplyLine}
    ${maxWalletLine}
    ${maxTxLine}
    ${taxLines}
    ${blacklistLines}

    constructor(${constructorArgs})
        ${superCalls}
    {
        ${hasTax ? `isExcludedFromTax[msg.sender] = true;` : ''}
        ${isGovernance ? `_transferOwnership(_initialOwner);` : ''}
        _mint(msg.sender, _initialSupply);
    }

    ${decimalsOverride}
    ${mintFunction}
    ${pauseFunctions}
    ${taxFunctions}
    ${blacklistLines ? '' : ''}
    ${updateOverride}
    ${govNonces}
}
`;
}





const TOKEN_INFO_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function owner() view returns (address)',
];

export async function readTokenInfo(
  provider: ethers.BrowserProvider | ethers.JsonRpcProvider,
  tokenAddress: string,
  walletAddress?: string,
): Promise<{
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  balance?: string;
  owner?: string;
}> {
  const contract = new ethers.Contract(tokenAddress, TOKEN_INFO_ABI, provider);
  const [name, symbol, decBn, supply] = await Promise.all([
    contract.name(), contract.symbol(), contract.decimals(), contract.totalSupply(),
  ]);
  const decimals = Number(decBn);
  const totalSupply = ethers.formatUnits(supply, decimals);

  let balance: string | undefined;
  let owner: string | undefined;
  if (walletAddress) {
    balance = ethers.formatUnits(await contract.balanceOf(walletAddress), decimals);
    owner = await contract.owner().catch(() => undefined);
  }
  return { name, symbol, decimals, totalSupply, balance, owner };
}
