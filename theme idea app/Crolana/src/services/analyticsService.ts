import { ethers } from 'ethers';
import { MintActivity } from '../types';

class AnalyticsService {
  private provider: ethers.BrowserProvider | null = null;
  private contract: ethers.Contract | null = null;
  private isListening = false;

  init(provider: ethers.BrowserProvider, contractAddress: string) {
    this.provider = provider;
    this.contract = new ethers.Contract(
      contractAddress,
      [
        'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
        'function totalSupply() view returns (uint256)',
        'function maxSupply() view returns (uint256)',
        'function cost() view returns (uint256)',
      ],
      provider
    );
  }

  async fetchInitialData() {
    if (!this.contract || !this.provider) return null;

    try {
      const [totalSupply, maxSupply, cost] = await Promise.all([
        this.contract.totalSupply(),
        this.contract.maxSupply(),
        this.contract.cost(),
      ]);

      const balance = await this.provider.getBalance(await this.contract.getAddress());

      return {
        totalSupply: Number(totalSupply),
        maxSupply: Number(maxSupply),
        cost: ethers.formatEther(cost),
        revenue: ethers.formatEther(balance),
      };
    } catch (error) {

      return null;
    }
  }

  async fetchRecentActivity(limit = 10): Promise<MintActivity[]> {
    if (!this.contract || !this.provider) return [];

    try {
      const currentBlock = await this.provider.getBlockNumber();
      
      const fromBlock = Math.max(0, currentBlock - 1000);
      
      const filter = this.contract.filters.Transfer(ethers.ZeroAddress, null, null);
      const logs = await this.contract.queryFilter(filter, fromBlock, 'latest');

      const activities: MintActivity[] = await Promise.all(
        logs.slice(-limit).reverse().map(async (log: any) => {
          const tx = await log.getTransaction();
          const receipt = await log.getTransactionReceipt();
          const block = await log.getBlock();

          return {
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            timestamp: block ? block.timestamp * 1000 : Date.now(),
            from: log.args[1], 
            tokenId: Number(log.args[2]),
            price: ethers.formatEther(tx.value),
            gasUsed: receipt && receipt.gasPrice ? ethers.formatEther(receipt.gasUsed * receipt.gasPrice) : '0',
          };
        })
      );

      return activities;
    } catch (error) {

      return [];
    }
  }

  startListening(onMint: (activity: MintActivity) => void) {
    if (!this.contract || !this.provider || this.isListening) return;

    this.isListening = true;
    
    this.contract.on('Transfer', async (from, to, tokenId, event) => {
      
      if (from === ethers.ZeroAddress) {
        try {
          const tx = await event.getTransaction();
          const receipt = await event.getTransactionReceipt();
          const block = await event.getBlock();

          const activity: MintActivity = {
            txHash: event.log.transactionHash,
            blockNumber: event.log.blockNumber,
            timestamp: block ? block.timestamp * 1000 : Date.now(),
            from: to,
            tokenId: Number(tokenId),
            price: ethers.formatEther(tx.value),
            gasUsed: receipt && receipt.gasPrice ? ethers.formatEther(receipt.gasUsed * receipt.gasPrice) : '0',
          };

          onMint(activity);
        } catch (error) {

        }
      }
    });
  }

  stopListening() {
    if (this.contract && this.isListening) {
      this.contract.removeAllListeners('Transfer');
      this.isListening = false;
    }
  }
}

export const analyticsService = new AnalyticsService();
