import React from 'react';
import { TokenBuilder } from '../components/token/TokenBuilder';
import { Coins, Info } from 'lucide-react';

export function TokenBuilderPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">ERC-20 Token Builder</h1>
        <p className="text-slate-400 text-sm">Deploy a custom ERC-20 token on Cronos — separate from your NFT collection.</p>
      </div>
      <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-sm">
        <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-blue-300/80">
          This tool is independent of the NFT launch workflow. Use it to deploy a utility token, governance token, or project currency alongside your NFT collection.
          Contract generation and compilation happen server-side; deployment is signed in your browser wallet.
        </p>
      </div>
      <TokenBuilder />
    </div>
  );
}
export default TokenBuilderPage;
