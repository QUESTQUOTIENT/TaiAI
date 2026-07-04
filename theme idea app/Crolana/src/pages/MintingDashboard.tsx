import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { MintOverview } from '../components/minting/MintOverview';
import { MintPhases } from '../components/minting/MintPhases';
import { OwnerMint } from '../components/minting/OwnerMint';
import { AirdropManager } from '../components/minting/AirdropManager';
import { RevealManager } from '../components/minting/RevealManager';
import { MintZone } from '../components/minting/MintZone';
import { Shield, Globe } from 'lucide-react';

export function MintingDashboard() {
  const { deployedAddress, walletAddress, network, advancedContractConfig } = useAppStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'phases' | 'owner' | 'airdrop' | 'reveal' | 'mintzone'>('overview');
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(true);

  useEffect(() => {
    const checkNetwork = async () => {
      if ((window as any).ethereum) {
        const chainId = await (window as any).ethereum.request({ method: 'eth_chainId' });
        setIsCorrectNetwork(parseInt(chainId, 16) === network.chainId);
      }
    };
    checkNetwork();
    
    if ((window as any).ethereum) {
        (window as any).ethereum.on('chainChanged', checkNetwork);
    }
    return () => {
        if ((window as any).ethereum) (window as any).ethereum.removeListener('chainChanged', checkNetwork);
    }
  }, [network.chainId]);

  const handleSwitchNetwork = async () => {
    if (!(window as any).ethereum) return;
    try {
      await (window as any).ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${network.chainId.toString(16)}` }],
      });
    } catch (error: any) {
      console.warn("[MintingDashboard] Network switch failed:", error?.message ?? error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 overflow-x-auto pb-2 border-b border-slate-800">
        {[
          { id: 'overview',  label: 'Overview' },
          { id: 'phases',    label: 'Phases Manager' },
          { id: 'owner',     label: 'Owner Mint' },
          { id: 'airdrop',   label: 'Airdrop' },
          { id: 'reveal',    label: 'Reveal Manager' },
          { id: 'mintzone',  label: '🌐 Mint Zone' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-sm font-bold whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'text-white border-b-2 border-blue-500'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-[500px]">
        {activeTab === 'overview'  && <MintOverview />}
        {activeTab === 'phases'    && <MintPhases />}
        {activeTab === 'owner'     && <OwnerMint />}
        {activeTab === 'airdrop'   && <AirdropManager />}
        {activeTab === 'reveal'    && <RevealManager />}
        {activeTab === 'mintzone'  && <MintZone />}
      </div>
    </div>
  );
}
export default MintingDashboard;
