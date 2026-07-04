


const MAINNET_WS = 'wss://api.mainnet-beta.solana.com';
const DEVNET_WS  = 'wss://api.devnet.solana.com';

function getRpcProxyUrl(cluster: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  return cluster === 'devnet'
    ? `${origin}/api/solana/rpc/devnet`
    : `${origin}/api/solana/rpc`;
}

function getWsEndpoint(cluster: string): string {
  return cluster === 'devnet' ? DEVNET_WS : MAINNET_WS;
}


async function pollForConfirmation(
  connection: any,
  signature: string,
  lastValidBlockHeight: number,
  timeoutMs = 90_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1500));
    try {
      const { value } = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: false,
      });
      if (!value) continue;
      if (value.err) throw new Error('Transaction failed on-chain: ' + JSON.stringify(value.err));
      const cs = value.confirmationStatus;
      if (cs === 'confirmed' || cs === 'finalized') return;
    } catch (e: any) {
      if (e.message?.includes('Transaction failed')) throw e;
    }
    
    const blockHeight = await connection.getBlockHeight().catch(() => 0);
    if (blockHeight > lastValidBlockHeight) {
      throw new Error('block height exceeded — transaction expired before confirmation');
    }
  }
  throw new Error('Transaction confirmation timed out after 90 s');
}



export interface SplTokenConfig {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: string;
  description?: string;
  imageUri?: string;
  revokeMintAuthority: boolean;
  revokeFreezeAuthority: boolean;
  cluster?: string;
}

export interface SplTokenResult {
  mintAddress: string;
  txSignature: string;
  associatedTokenAccount: string;
  explorerUrl: string;
}



export async function createSplToken(config: SplTokenConfig): Promise<SplTokenResult> {
  const cluster = config.cluster ?? 'mainnet-beta';
  const rpcUrl  = getRpcProxyUrl(cluster);
  const wsUrl   = getWsEndpoint(cluster);

  if (!window.solana?.isPhantom)  throw new Error('Phantom wallet not found. Install from https://phantom.app');
  if (!window.solana.publicKey)   throw new Error('Phantom wallet not connected. Connect first.');

  const web3 = await import('@solana/web3.js');
  const spl  = await import('@solana/spl-token');

  
  const connection = new web3.Connection(rpcUrl, {
    commitment: 'confirmed',
    wsEndpoint: wsUrl,
    disableRetryOnRateLimit: false,
  });

  const payerPubkey = new web3.PublicKey(window.solana.publicKey.toBase58());
  const mintKeypair = web3.Keypair.generate();
  const mintRent    = await connection.getMinimumBalanceForRentExemption(spl.MINT_SIZE);

  
  const ataAddress = await spl.getAssociatedTokenAddress(
    mintKeypair.publicKey,
    payerPubkey,
    false,
    spl.TOKEN_PROGRAM_ID,
    spl.ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const supplyRaw = BigInt(
    Math.floor(parseFloat(config.initialSupply) * 10 ** config.decimals).toString(),
  );

  
  let signature = '';
  let lastErr: any;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

      const tx = new web3.Transaction();
      tx.recentBlockhash = blockhash;
      tx.feePayer        = payerPubkey;

      tx.add(web3.SystemProgram.createAccount({
        fromPubkey:       payerPubkey,
        newAccountPubkey: mintKeypair.publicKey,
        space:            spl.MINT_SIZE,
        lamports:         mintRent,
        programId:        spl.TOKEN_PROGRAM_ID,
      }));

      tx.add(spl.createInitializeMintInstruction(
        mintKeypair.publicKey,
        config.decimals,
        payerPubkey,
        config.revokeFreezeAuthority ? null : payerPubkey,
        spl.TOKEN_PROGRAM_ID,
      ));

      tx.add(spl.createAssociatedTokenAccountInstruction(
        payerPubkey, ataAddress, payerPubkey, mintKeypair.publicKey,
      ));

      tx.add(spl.createMintToInstruction(
        mintKeypair.publicKey, ataAddress, payerPubkey, supplyRaw,
      ));

      if (config.revokeMintAuthority) {
        tx.add(spl.createSetAuthorityInstruction(
          mintKeypair.publicKey,
          payerPubkey,
          spl.AuthorityType.MintTokens,
          null,
        ));
      }

      
      tx.partialSign(mintKeypair);

      
      const signedTx = await window.solana!.signTransaction(tx);

      signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });

      
      await pollForConfirmation(connection, signature, lastValidBlockHeight);
      break; 
    } catch (err: any) {
      lastErr = err;
      const msg = err?.message ?? '';
      const isExpiry = msg.includes('block height exceeded') || msg.includes('Blockhash not found');
      if (isExpiry && attempt < 2) {
        console.warn(`[solanaSpl] Blockhash expired (attempt ${attempt + 1}), retrying with fresh blockhash…`);
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      throw err;
    }
  }

  if (!signature) throw lastErr ?? new Error('Token creation failed after retries');

  const clusterParam = cluster === 'devnet' ? '?cluster=devnet' : '';
  return {
    mintAddress:            mintKeypair.publicKey.toBase58(),
    txSignature:            signature,
    associatedTokenAccount: ataAddress.toBase58(),
    explorerUrl: `https://solscan.io/address/${mintKeypair.publicKey.toBase58()}${clusterParam}`,
  };
}



export interface AirdropEntry { address: string; amount: string; }

export async function airdropSplTokens(params: {
  mintAddress: string;
  decimals: number;
  recipients: AirdropEntry[];
  cluster?: string;
}): Promise<string[]> {
  const { mintAddress, decimals, recipients, cluster = 'mainnet-beta' } = params;
  const rpcUrl = getRpcProxyUrl(cluster);
  const wsUrl  = getWsEndpoint(cluster);

  if (!window.solana?.isPhantom || !window.solana.publicKey) {
    throw new Error('Phantom wallet not connected.');
  }

  const web3 = await import('@solana/web3.js');
  const spl  = await import('@solana/spl-token');

  const connection  = new web3.Connection(rpcUrl, {
    commitment: 'confirmed',
    wsEndpoint: wsUrl,
    disableRetryOnRateLimit: false,
  });

  const payerPubkey = new web3.PublicKey(window.solana.publicKey.toBase58());
  const mintPubkey  = new web3.PublicKey(mintAddress);
  const senderAta   = await spl.getAssociatedTokenAddress(mintPubkey, payerPubkey);
  const signatures: string[] = [];

  const BATCH = 5; 
  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = recipients.slice(i, i + BATCH);
    let batchSig = '';
    let lastErr: any;

    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        const tx = new web3.Transaction();
        tx.recentBlockhash = blockhash;
        tx.feePayer        = payerPubkey;

        for (const recipient of batch) {
          const destPubkey = new web3.PublicKey(recipient.address);
          const destAta    = await spl.getAssociatedTokenAddress(mintPubkey, destPubkey);
          const ataInfo    = await connection.getAccountInfo(destAta);
          if (!ataInfo) {
            tx.add(spl.createAssociatedTokenAccountInstruction(
              payerPubkey, destAta, destPubkey, mintPubkey,
            ));
          }
          const rawAmount = BigInt(Math.floor(parseFloat(recipient.amount) * 10 ** decimals));
          tx.add(spl.createTransferInstruction(senderAta, destAta, payerPubkey, rawAmount));
        }

        const signed = await window.solana!.signTransaction(tx);
        const sig    = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        });
        await pollForConfirmation(connection, sig, lastValidBlockHeight);
        batchSig = sig;
        break;
      } catch (err: any) {
        lastErr = err;
        const msg = err?.message ?? '';
        if ((msg.includes('block height exceeded') || msg.includes('Blockhash not found')) && attempt < 2) {
          console.warn(`[solanaSpl] Airdrop batch expiry (attempt ${attempt + 1}), retrying…`);
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        throw err;
      }
    }
    signatures.push(batchSig);
  }
  return signatures;
}



export async function getSplMintInfo(mintAddress: string, cluster = 'mainnet-beta') {
  const rpcUrl = getRpcProxyUrl(cluster);
  const wsUrl  = getWsEndpoint(cluster);
  const web3   = await import('@solana/web3.js');
  const spl    = await import('@solana/spl-token');
  const connection = new web3.Connection(rpcUrl, {
    commitment: 'confirmed',
    wsEndpoint: wsUrl,
    disableRetryOnRateLimit: false,
  });
  const mint = await spl.getMint(connection, new web3.PublicKey(mintAddress));
  return {
    decimals:        mint.decimals,
    supply:          mint.supply.toString(),
    mintAuthority:   mint.mintAuthority?.toBase58()   ?? null,
    freezeAuthority: mint.freezeAuthority?.toBase58() ?? null,
    isInitialized:   mint.isInitialized,
  };
}
