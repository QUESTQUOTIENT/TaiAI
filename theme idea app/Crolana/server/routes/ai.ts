import { Router, Request, Response } from 'express';

const router = Router();


const AI_API_BASE_URL = process.env.AI_API_BASE_URL || 'https://api.openai.com/v1';
const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || process.env.TOGETHER_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';


const REQUIRES_API_KEY = !AI_API_BASE_URL.includes('localhost') || !!AI_API_KEY;


async function callAI(messages: Array<{role: string; content: string}>, model: string): Promise<string> {
  
  const payload = {
    model: model || AI_MODEL,
    messages,
    max_tokens: 1024,
    temperature: 0.7,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  
  if (AI_API_KEY) {
    headers['Authorization'] = `Bearer ${AI_API_KEY}`;
  }

  const url = AI_API_BASE_URL.endsWith('/')
    ? `${AI_API_BASE_URL}chat/completions`
    : `${AI_API_BASE_URL}/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      throw new Error('AUTH_FAILED: Invalid or missing API key');
    }
    if (res.status === 429) {
      throw new Error('RATE_LIMITED: Too many requests');
    }
    if (res.status === 404 || res.status === 400) {
      throw new Error(`INVALID_URL: Cannot connect to AI API at ${AI_API_BASE_URL}`);
    }
    throw new Error(`API_ERROR ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from AI service');
  return content;
}


const SYSTEM_PROMPTS: Record<string, string> = {
  app: `You are the AI assistant embedded in Crolana, a professional NFT & DeFi platform on the Cronos blockchain. You have expert knowledge of every platform feature:

FEATURES:
- Asset Creation: upload and manage NFT artwork
- Metadata Builder: create ERC-721/1155 JSON metadata with traits and rarity
- IPFS Manager: upload to Pinata/IPFS, manage CIDs and pin metadata
- Contract Builder: configure ERC-721, ERC-721A, ERC-1155, ERC-20 contracts
- Deploy Wizard: compile Solidity with solc, deploy to mainnet/testnet, estimate gas
- Minting Dashboard: manage mint phases (public/allowlist/free), pricing, supply
- NFT Gallery: browse minted tokens, view metadata on-chain
- Marketplace Prep: prepare listings for OpenSea, EbisusBay
- Analytics: on-chain stats, holder analytics, volume data
- Launchpad: featured NFT project launches
- Token Builder: create custom ERC-20 tokens (mintable, burnable, pausable, transfer tax)
- Token Swap: swap tokens via VVS Finance DEX
- Liquidity Manager: add/remove liquidity pools on VVS Finance

CRONOS NETWORK:
- Mainnet: Chain ID 25 | RPC: https://evm.cronos.org | Explorer: https://explorer.cronos.org
- Testnet: Chain ID 338 | RPC: https://evm-t3.cronos.org | Faucet: https://cronos.org/faucet

KEY CONTRACT ADDRESSES:
- VVS Finance Router: 0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae
- WCRO (mainnet): 0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23
- WCRO (testnet): 0x6a3173618859C7cd40fAF6921b5E9eB6A76f1fD

Be concise, practical, and step-by-step. Always give actionable guidance specific to Crolana.`,

  price: `You are a crypto market analyst specializing in the Cronos blockchain ecosystem.

Provide educational context on:
- CRO (Cronos token): crypto.com ecosystem, staking, burn mechanics, utility
- VVS Finance (VVS): DEX governance, crystal farming, liquidity incentives
- WCRO, USDC, USDT on Cronos chain
- NFT floor prices and collection metrics on Cronos
- DeFi TVL and protocol metrics

For real-time prices, always direct users to:
- https://crypto.com (CRO official price)
- https://vvs.finance (Cronos DEX)
- https://dexscreener.com/cronos (on-chain charts)
- https://coinmarketcap.com / https://coingecko.com

Always end price discussions with: "This is educational context only, not financial advice."`,

  code: `You are an expert EVM smart contract security analyst for the Cronos blockchain.

When given a contract address or asked about a contract:
1. Identify the contract type (ERC-20 token, ERC-721 NFT, DEX router, staking, etc.)
2. Explain what the contract does and its key functions
3. Identify security risk factors:
   - Owner privileges (can they drain funds, pause trading, change fees?)
   - Mint functions (unlimited minting risk?)
   - Blacklist/whitelist functions
   - Fee manipulation vectors
   - Proxy/upgradeability patterns
   - Honeypot indicators (can users sell freely?)
4. Rug pull risk assessment
5. Tokenomics analysis if applicable

KNOWN CRONOS CONTRACTS (trusted):
- VVS Router: 0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae
- VVS Factory: 0x3B44B2a187a7b3824131F8db5a74194D0a42Fc15
- WCRO: 0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23
- USDC: 0xc21223249CA28397B4B6541dfFaEcC539BfF0c59
- USDT: 0x66e428c3f67a68878562e79A0234c1F83c208770

For verification: https://explorer.cronos.org
Always conclude: "Always DYOR and never invest more than you can afford to lose."`,

  general: `You are a Web3 and crypto news analyst. Cover these topics:

- Cronos blockchain: protocol upgrades, new dApps, ecosystem grants, partnerships
- Crypto.com: product launches, CRO utility updates, exchange news
- NFT market: major collection launches, volume trends, marketplace developments
- DeFi: new protocols, TVL changes, governance votes, exploits/hacks
- Broader crypto: BTC/ETH major moves, regulatory developments, institutional adoption
- Blockchain infrastructure: L2 scaling, bridges, interoperability
- AI x Crypto trends

Recommend these for latest news:
- https://cronos.org/blog (Cronos official)
- https://crypto.com/news
- https://decrypt.co
- https://theblock.co
- https://defillama.com

Note your knowledge cutoff (early 2025) when discussing recent events.`,
};


router.post('/chat', async (req: Request, res: Response) => {
  const { mode = 'app', message, history = [] } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  
  const validModes = ['app', 'price', 'code', 'general'];
  if (!validModes.includes(mode)) {
    return res.status(400).json({ error: 'invalid mode' });
  }

  
  if (REQUIRES_API_KEY && !AI_API_KEY) {
    return res.status(503).json({ error: 'AI service not configured. Set AI_API_KEY or OPENAI_API_KEY environment variable.' });
  }

  try {
    
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.app },
      ...history.map((h: { role: string; content: string }) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user', content: message },
    ];

    
    const reply = await callAI(messages, AI_MODEL);

    res.json({ reply, model: AI_MODEL });
  } catch (err: any) {
    console.error('AI API error:', err);
    const msg = err.message || 'Unknown error';

    
    if (msg.includes('AUTH_FAILED') || msg.includes('401')) {
      return res.status(500).json({ error: 'AI API key invalid or unauthorized.' });
    }
    if (msg.includes('RATE_LIMITED') || msg.includes('429')) {
      return res.status(429).json({ error: 'AI API rate limit exceeded. Try again later.' });
    }
    if (msg.includes('INVALID_URL') || msg.includes('Cannot connect')) {
      return res.status(503).json({ error: `Cannot connect to AI API at ${AI_API_BASE_URL}. Check AI_API_BASE_URL configuration.` });
    }
    if (msg.includes('OPENAI_API_KEY') || msg.includes('not configured')) {
      return res.status(503).json({ error: 'AI service not configured. Set AI_API_KEY or OPENAI_API_KEY environment variable.' });
    }

    res.status(500).json({ error: 'AI service error', details: msg });
  }
});

export default router;
