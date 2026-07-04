const API_BASE = '/api';


export async function recordTransaction(data: {
  walletAddress: string;
  chainId: number;
  txHash: string;
  type: 'swap' | 'mint' | 'deploy' | 'liquidity_add' | 'liquidity_remove' | 'approval';
  status?: 'CONFIRMED' | 'FAILED';
  blockNumber?: number;
  metadata?: Record<string, unknown>;
  executedAt?: Date;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        executedAt: data.executedAt?.toISOString(),
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, error: err.error || 'Failed to record transaction' };
    }
    return { success: true };
  } catch (err: any) {
    console.error('recordTransaction error:', err);
    return { success: false, error: err.message };
  }
}


export async function getTransactions(params: {
  walletAddress: string;
  chainId?: number;
  limit?: number;
}): Promise<{
  transactions: Array<{
    id: string;
    chain: 'CRONOS' | 'SOLANA';
    txHash: string;
    status: string;
    blockNumber?: number;
    metadata?: Record<string, unknown>;
    confirmedAt?: string;
    createdAt: string;
  }>;
}> {
  const searchParams = new URLSearchParams({
    walletAddress: params.walletAddress,
    ...(params.chainId && { chainId: params.chainId.toString() }),
    ...(params.limit && { limit: params.limit.toString() }),
  });
  const response = await fetch(`${API_BASE}/transactions?${searchParams}`);
  if (!response.ok) {
    throw new Error('Failed to fetch transactions');
  }
  return response.json();
}
