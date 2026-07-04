

let _web3: typeof import('@solana/web3.js') | null = null;
let _spl: typeof import('@solana/spl-token') | null = null;

export async function getWeb3() {
  if (!_web3) _web3 = await import('@solana/web3.js');
  return _web3;
}

export async function getSplToken() {
  if (!_spl) _spl = await import('@solana/spl-token');
  return _spl;
}
