

import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';



type Mode = 'app' | 'price' | 'code' | 'general';
interface Msg { id: string; role: 'user' | 'assistant'; text: string; time: string; mode: Mode; }



const MODES: { id: Mode; label: string; icon: string; accent: string }[] = [
  { id: 'app',    label: 'App Help',  icon: '🏗️', accent: '#3b82f6' },
  { id: 'price',  label: 'Prices',    icon: '💰', accent: '#10b981' },
  { id: 'code',   label: 'Contracts', icon: '🔍', accent: '#f59e0b' },
  { id: 'general',label: 'General',   icon: '🌐', accent: '#8b5cf6' },
];



const SYSTEM_PROMPTS: Record<Mode, string> = {
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



const QUICKS: Record<Mode, string[]> = {
  app:    ['How do I deploy my first NFT collection?', 'How to connect MetaMask to Cronos?', 'ERC-721 vs ERC-1155 — which to use?', 'How to upload metadata to IPFS?', 'How does the Token Builder work?'],
  price:  ['What drives CRO token price?', 'What is VVS Finance & the VVS token?', 'Top Cronos tokens by market cap', 'Where to track Cronos DeFi TVL?', 'What is WCRO and how is it used?'],
  code:   ['Analyze VVS Router: 0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae', 'What is the WCRO contract?', 'How to spot a honeypot token?', 'Red flags in an ERC-20 contract', 'What is ERC-20 approval risk?'],
  general:['Latest Cronos ecosystem updates', 'Recent major NFT market news', "What's happening in DeFi this week?", 'Cronos new partnerships', 'Major crypto regulatory news'],
};



const uid  = () => Math.random().toString(36).slice(2, 9);
const tnow = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function renderMd(txt: string): string {
  return txt
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g,
      '<code style="background:rgba(0,0,0,.45);padding:1px 5px;border-radius:4px;font-size:10.5px;color:#93c5fd;font-family:\'JetBrains Mono\',monospace">$1</code>')
    .replace(/^#{1,3}\s+(.+)$/gm,
      '<strong style="display:block;color:#e2e8f0;font-size:13px;margin:6px 0 3px">$1</strong>')
    .replace(/^[-•*]\s+(.+)$/gm,
      '<span style="display:block;padding-left:10px;margin:2px 0;color:#cbd5e1">• $1</span>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

// ── Server AI API call ───────────────────────────────────────────────────────

async function callServerAI(
  mode: Mode,
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, message, history }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 503) {
      throw new Error('AI service not configured. Set OPENAI_API_KEY on server.');
    }
    throw new Error(data.error || `API error ${res.status}`);
  }

  const data = await res.json();
  return data.reply || 'No response from AI.';
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AIAssistant() {
  const [open,     setOpen]     = useState(false);
  const [mode,     setMode]     = useState<Mode>('app');
  const [msgs,     setMsgs]     = useState<Msg[]>([]);
  const [input,    setInput]    = useState('');
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  const inputRef = useRef<HTMLInputElement>(null);
  const msgsEndRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  // Auto-focus input when opened
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  // Close on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // Track window resize for responsive layout
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const send = async () => {
    const txt = input.trim();
    if (!txt || busy) return;

    setError(null);
    setBusy(true);
    const userMsg: Msg = { id: uid(), role: 'user', text: txt, time: tnow(), mode };
    setMsgs(prev => [...prev, userMsg]);
    setInput('');

    try {
      // Build history in OpenAI format
      const history = msgs.slice(-10).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.text,
      }));

      const reply = await callServerAI(mode, txt, history);
      setMsgs(prev => [...prev, { id: uid(), role: 'assistant', text: reply, time: tnow(), mode }]);
    } catch (err: any) {
      const msg = err.message;
      if (msg.includes('503') || msg.includes('not configured')) {
        setServiceUnavailable(true);
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const clear = () => setMsgs([]);

  const quick = (q: string) => {
    setInput(q);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div ref={widgetRef} style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99999 }}>
      {/* Toggle Button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: 64, height: 64,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
          border: 'none',
          boxShadow: '0 8px 32px rgba(37,99,235,.45)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform .2s, box-shadow .2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(37,99,235,.55)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(37,99,235,.45)'; }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {/* Chat Window */}
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            right: 0,
            width: Math.min(420, windowWidth - 48),
            maxWidth: 'calc(100vw - 48px)',
            height: 560,
            maxHeight: 'calc(100vh - 120px)',
            background: '#0f172a',
            border: '1px solid rgba(148,163,184,.18)',
            borderRadius: 20,
            boxShadow: '0 -16px 48px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.05)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(148,163,184,.08)',
            background: 'rgba(30,41,59,.4)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 20 }}>🤖</div>
              <div>
                <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 15 }}>Crolana AI</div>
                <div style={{ color: '#94a3b8', fontSize: 11 }}>Powered by Claude</div>
              </div>
            </div>
            <button onClick={clear} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18 }} title="Clear chat">🗑️</button>
          </div>

          {/* Mode selector */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(148,163,184,.08)', padding: '12px 16px', gap: 8, flexWrap: 'wrap' }}>
            {MODES.map(m => (
              <button
                key={m.id}
                onClick={() => { setMode(m.id); setMsgs([]); }}
                style={{
                  flex: '1 1 45%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${mode === m.id ? m.accent : 'rgba(148,163,184,.15)'}`,
                  background: mode === m.id ? `${m.accent}22` : 'transparent',
                  color: mode === m.id ? '#fff' : '#94a3b8',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all .2s',
                }}
              >
                <span style={{ marginRight: 6 }}>{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {msgs.length === 0 && (
              <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
                Ask me anything about Crolana!
                <div style={{ marginTop: 12 }}>
                  {QUICKS[mode].map((q, i) => (
                    <button
                      key={i}
                      onClick={() => quick(q)}
                      style={{
                        display: 'block',
                        width: '100%',
                        marginBottom: 6,
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,.03)',
                        border: '1px solid rgba(148,163,184,.12)',
                        borderRadius: 8,
                        color: '#cbd5e1',
                        fontSize: 11,
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map(m => (
              <div key={m.id} style={{
                display: 'flex',
                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                gap: 8,
              }}>
                {m.role === 'assistant' && <span style={{ fontSize: 18, alignSelf: 'flex-end' }}>🤖</span>}
                <div style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: 16,
                  background: m.role === 'user' ? '#2563eb' : 'rgba(255,255,255,.08)',
                  color: m.role === 'user' ? '#fff' : '#f1f5f9',
                  fontSize: 13,
                  lineHeight: 1.5,
                  border: m.role === 'assistant' ? '1px solid rgba(148,163,184,.12)' : 'none',
                  borderBottomRightRadius: m.role === 'user' ? 4 : 16,
                  borderBottomLeftRadius: m.role === 'assistant' ? 4 : 16,
                }} dangerouslySetInnerHTML={{ __html: renderMd(m.text) }} />
                {m.role === 'user' && <span style={{ fontSize: 18, alignSelf: 'flex-end' }}>👤</span>}
              </div>
            ))}

            {busy && (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🤖</span>
                <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,.08)', borderRadius: 16, borderBottomLeftRadius: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, background: '#64748b', borderRadius: '50%', animation: 'csai-bounce 1.4s infinite ease-in-out both' }}></span>
                  <span style={{ width: 8, height: 8, background: '#64748b', borderRadius: '50%', animation: 'csai-bounce 1.4s infinite ease-in-out both', animationDelay: '.16s' }}></span>
                  <span style={{ width: 8, height: 8, background: '#64748b', borderRadius: '50%', animation: 'csai-bounce 1.4s infinite ease-in-out both', animationDelay: '.32s' }}></span>
                </div>
              </div>
            )}

            {error && (
              <div style={{ background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', color: '#fca5a5', padding: 10, borderRadius: 10, fontSize: 12 }}>
                ⚠ {error}
              </div>
            )}

            {serviceUnavailable && (
              <div style={{ background: 'rgba(234,179,8,.15)', border: '1px solid rgba(234,179,8,.3)', color: '#fde047', padding: 10, borderRadius: 10, fontSize: 12 }}>
                ⚠ AI service is not configured. Set OPENAI_API_KEY in server environment variables.
              </div>
            )}

            <div ref={msgsEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: 16, borderTop: '1px solid rgba(148,163,184,.08)', background: 'rgba(30,41,59,.4)' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Ask about Crolana…"
                disabled={busy || serviceUnavailable}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,.05)',
                  border: '1px solid rgba(148,163,184,.12)',
                  borderRadius: 12,
                  color: serviceUnavailable ? '#64748b' : '#fff',
                  padding: '12px 16px',
                  fontSize: 13,
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(37,99,235,.5)'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(148,163,184,.12)'; }}
              />
              <button
                onClick={send}
                disabled={busy || serviceUnavailable || !input.trim()}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: (busy || serviceUnavailable || !input.trim()) ? 'rgba(255,255,255,.05)' : 'linear-gradient(135deg, #2563eb, #7c3aed)',
                  border: 'none',
                  color: (busy || serviceUnavailable || !input.trim()) ? '#64748b' : '#fff',
                  cursor: (busy || serviceUnavailable || !input.trim()) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {busy ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'csai-spin .7s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.2-8.56"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                )}
              </button>
            </div>
            <div style={{ fontSize: 10, color: '#475569', marginTop: 8, textAlign: 'center' }}>
              Press Enter to send • Shift+Enter for newline
            </div>
          </div>
        </div>
      )}

      {/* Styles for animations */}
      <style>{`
        @keyframes csai-spin { to { transform: rotate(360deg); } }
        @keyframes csai-bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
      `}</style>
    </div>
  );
}
