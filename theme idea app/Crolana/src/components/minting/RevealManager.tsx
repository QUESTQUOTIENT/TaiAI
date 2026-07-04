import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store';
import { ethers } from 'ethers';
import { getReadProvider } from '../../lib/provider';
import { Eye, EyeOff, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';

export function RevealManager() {
  const { deployedAddress, advancedContractConfig, network, updateAdvancedContractConfig, addNotification } = useAppStore();
  const [isRevealed, setIsRevealed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [baseURI, setBaseURI] = useState(advancedContractConfig.advanced.baseURI || '');
  const [hiddenURI, setHiddenURI] = useState(advancedContractConfig.advanced.hiddenURI || '');

  useEffect(() => {
    const fetchRevealStatus = async () => {
      if (!deployedAddress) return;
      try {
        const provider = getReadProvider(network.chainId);
        const contract = new ethers.Contract(
          deployedAddress,
          [
            'function revealed() view returns (bool)',
            'function baseURI() view returns (string)',
            'function hiddenMetadataUri() view returns (string)'
          ],
          provider
        );
        
        const [revealed, currentBaseURI, currentHiddenURI] = await Promise.all([
          contract.revealed(),
          contract.baseURI(),
          contract.hiddenMetadataUri()
        ]);

        setIsRevealed(revealed);
        if (currentBaseURI) setBaseURI(currentBaseURI);
        if (currentHiddenURI) setHiddenURI(currentHiddenURI);
        
      } catch (error) {

      }
    };

    fetchRevealStatus();
  }, [deployedAddress]);

  const handleToggleReveal = async () => {
    if (!deployedAddress || !(window as any).ethereum) return;
    setIsLoading(true);
    addNotification({ type: 'loading', title: isRevealed ? 'Hiding Collection…' : 'Revealing Collection…', message: 'Waiting for wallet…', duration: 0 });
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      if (!isRevealed) {
        
        const contract = new ethers.Contract(
          deployedAddress,
          [
            'function reveal(string memory _newBaseURI) public',
            'function setRevealed(bool _state) public',
          ],
          signer
        );
        if (baseURI.trim()) {
          const tx = await contract.reveal(baseURI.trim());
          await tx.wait();
        } else {
          const tx = await contract.setRevealed(true);
          await tx.wait();
        }
      } else {
        const contract = new ethers.Contract(
          deployedAddress,
          ['function setRevealed(bool _state) public'],
          signer
        );
        const tx = await contract.setRevealed(false);
        await tx.wait();
      }

      const newState = !isRevealed;
      setIsRevealed(newState);
      updateAdvancedContractConfig({
        advanced: { ...advancedContractConfig.advanced, isRevealed: newState }
      });
      addNotification({
        type: 'success',
        title: newState ? '🎉 Collection Revealed!' : 'Collection Hidden',
        message: newState ? 'Holders can now see their actual NFTs.' : 'Reverted to hidden metadata.',
        duration: 6000
      });
    } catch (error: any) {
      const msg = error.code === 4001 ? 'Transaction rejected.' : (error.reason || error.message || 'Transaction failed.');
      addNotification({ type: 'error', title: 'Transaction Failed', message: msg, duration: 6000 });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateURIs = async () => {
    if (!deployedAddress || !(window as any).ethereum) return;
    setIsLoading(true);
    addNotification({ type: 'loading', title: 'Updating URIs…', message: 'Waiting for wallet…', duration: 0 });
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        deployedAddress,
        [
          'function setBaseURI(string memory _newBaseURI) public',
          'function setHiddenMetadataUri(string memory _uri) public',
        ],
        signer
      );

      const baseChanged = baseURI !== advancedContractConfig.advanced.baseURI;
      const hiddenChanged = hiddenURI !== advancedContractConfig.advanced.hiddenURI;

      if (baseChanged) {
        const tx = await contract.setBaseURI(baseURI);
        await tx.wait();
      }

      if (hiddenChanged) {
        const tx = await contract.setHiddenMetadataUri(hiddenURI);
        await tx.wait();
      }

      if (!baseChanged && !hiddenChanged) {
        addNotification({ type: 'info', title: 'No Changes', message: 'URIs are already up to date.', duration: 3000 });
        setIsLoading(false);
        return;
      }

      updateAdvancedContractConfig({
        advanced: { ...advancedContractConfig.advanced, baseURI, hiddenURI }
      });

      addNotification({ type: 'success', title: 'URIs Updated', message: 'Metadata URIs updated on-chain.', duration: 5000 });
    } catch (error: any) {
      const msg = error.code === 4001 ? 'Transaction rejected.' : (error.reason || error.message || 'Failed to update URIs.');
      addNotification({ type: 'error', title: 'Transaction Failed', message: msg, duration: 6000 });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              {isRevealed ? <Eye className="w-5 h-5 text-green-500" /> : <EyeOff className="w-5 h-5 text-slate-500" />}
              Reveal Manager
            </h3>
            <p className="text-sm text-slate-400">
              Control when your community sees their actual NFTs.
            </p>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-bold ${
            isRevealed ? 'bg-green-500/20 text-green-400' : 'bg-slate-800 text-slate-400'
          }`}>
            Status: {isRevealed ? 'REVEALED' : 'HIDDEN'}
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
            <h4 className="font-medium text-white mb-4">URI Configuration</h4>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Base URI (Revealed Metadata)</label>
                <input 
                  type="text" 
                  value={baseURI}
                  onChange={(e) => setBaseURI(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  placeholder="ipfs://..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Hidden Metadata URI (Pre-reveal)</label>
                <input 
                  type="text" 
                  value={hiddenURI}
                  onChange={(e) => setHiddenURI(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  placeholder="ipfs://..."
                />
              </div>
              
              <button 
                onClick={handleUpdateURIs}
                disabled={isLoading || (baseURI === advancedContractConfig.advanced.baseURI && hiddenURI === advancedContractConfig.advanced.hiddenURI)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                Update URIs On-Chain
              </button>
            </div>
          </div>

          <div className="p-4 bg-blue-900/10 rounded-xl border border-blue-900/30 flex items-center justify-between">
            <div>
              <h4 className="font-medium text-white mb-1">Toggle Reveal State</h4>
              <p className="text-sm text-slate-400">
                {isRevealed 
                  ? "Your collection is currently revealed. Hiding it will revert to the placeholder metadata." 
                  : "Your collection is currently hidden. Revealing it will show the actual metadata."}
              </p>
            </div>
            <button 
              onClick={handleToggleReveal}
              disabled={isLoading}
              className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors ${
                isRevealed 
                  ? 'bg-slate-800 hover:bg-slate-700 text-white' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : (isRevealed ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />)}
              {isRevealed ? 'Hide Collection' : 'Reveal Collection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
