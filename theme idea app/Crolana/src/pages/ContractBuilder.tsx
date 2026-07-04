import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { AdvancedContractConfig, ContractType } from '../types';
import { Settings, Code, Rocket, CheckCircle, RefreshCw, Zap, Layers, Database, Shield, AlertTriangle, Copy, ExternalLink, Globe, Twitter, MessageCircle, Github } from 'lucide-react';
import { isSolanaNetwork } from '../types';
import { Link } from 'react-router-dom';
import { ethers } from 'ethers';

export function ContractBuilder() {
  const { network, advancedContractConfig, updateAdvancedContractConfig, addNotification, updateNotification, walletAddress, setDeployedAddress, deployedAddress, ipfsCid } = useAppStore();

  if (isSolanaNetwork(network)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4 p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto">
          <Zap className="w-8 h-8 text-purple-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Solana Doesn't Use Solidity Contracts</h2>
        <p className="text-slate-400 max-w-md text-sm">
          This tool generates ERC-721 / ERC-1155 Solidity contracts for EVM chains.
          On Solana, NFTs are created through Metaplex programs — head to the Minting page to mint your collection.
        </p>
        <Link to="/minting"
          className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl transition-colors">
          <Zap className="w-4 h-4" /> Go to Solana Minting
        </Link>
      </div>
    );
  }
  const [activeTab, setActiveTab] = useState<'preview' | 'deploy'>('preview');
  const [isCompiling, setIsCompiling] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [compilationResult, setCompilationResult] = useState<{ abi: any[]; bytecode: string; source: string } | null>(null);
  const [generatedSource, setGeneratedSource] = useState('');
  const [deploymentStatus, setDeploymentStatus] = useState('');
  const [txHash, setTxHash] = useState('');
  const [gasEstimate, setGasEstimate] = useState('');
  const [socialLinks, setSocialLinks] = useState({
    website: '', twitter: '', telegram: '', github: '', description: '',
  });
  const updateSocial = (k: string, v: string) => setSocialLinks(p => ({ ...p, [k]: v }));

  const currentStep = !generatedSource ? 0 : !compilationResult ? 1 : !deployedAddress ? 2 : 3;
  const steps = ['Configure', 'Generate', 'Compile & Estimate', 'Deploy'];

  // Auto-fill base URI from IPFS state
  useEffect(() => {
    if (ipfsCid && !advancedContractConfig.advanced.baseURI) {
      updateAdvancedContractConfig({ advanced: { ...advancedContractConfig.advanced, baseURI: `ipfs://${ipfsCid}/` } });
    }
  }, [ipfsCid]);

  const handleGenerate = async () => {
    if (!advancedContractConfig.name.trim()) {
      addNotification({ type: 'error', title: 'Missing Name', message: 'Contract name is required.', duration: 3000 });
      return;
    }
    if (!advancedContractConfig.symbol.trim()) {
      addNotification({ type: 'error', title: 'Missing Symbol', message: 'Token symbol is required.', duration: 3000 });
      return;
    }
    const notifId = addNotification({ type: 'loading', title: 'Generating Contract', message: 'Building Solidity source…', duration: 0 });
    try {
      const res = await fetch('/api/contract/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...advancedContractConfig, socialLinks }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setGeneratedSource(data.source);
      setCompilationResult(null);
      setActiveTab('preview');
      updateNotification(notifId, { type: 'success', title: 'Contract Generated', message: 'Review the source, then compile.', duration: 3000 });
    } catch (err: any) {
      updateNotification(notifId, { type: 'error', title: 'Generation Failed', message: err.message, duration: 5000 });
    }
  };

  const handleCompile = async () => {
    if (!generatedSource) return;
    setIsCompiling(true);
    const notifId = addNotification({ type: 'loading', title: 'Compiling with solc', message: 'This may take 10–30 seconds…', duration: 0 });
    try {
      const res = await fetch('/api/contract/compile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: advancedContractConfig }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Compilation failed');
      setCompilationResult(data);
      setActiveTab('deploy');
      updateNotification(notifId, { type: 'success', title: 'Compilation Successful', message: 'ABI and bytecode ready. Estimating gas…', duration: 2000 });
      // Fetch live gas estimate
      try {
        const gasRes = await fetch('/api/contract/estimate-gas', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bytecode: data.bytecode,
            abi: data.abi,
            networkId: network.chainId,
            constructorArgs: [advancedContractConfig.name, advancedContractConfig.symbol, advancedContractConfig.advanced.baseURI || '', advancedContractConfig.advanced.hiddenURI || ''],
          }),
        });
        const gasData = await gasRes.json();
        setGasEstimate(`${Number(gasData.gasEstimate).toLocaleString()} units (~${gasData.estimatedCostCRO} CRO)`);
      } catch { setGasEstimate('~2,500,000 units'); }
    } catch (err: any) {
      updateNotification(notifId, { type: 'error', title: 'Compilation Failed', message: err.message, duration: 8000 });
    } finally {
      setIsCompiling(false);
    }
  };

  const handleDeploy = async () => {
    if (!compilationResult) return;
    if (!(window as any).ethereum) { addNotification({ type: 'error', title: 'No Wallet', message: 'Install MetaMask or a Web3 wallet.', duration: 5000 }); return; }
    if (!walletAddress) { addNotification({ type: 'error', title: 'Not Connected', message: 'Connect your wallet first.', duration: 5000 }); return; }

    setIsDeploying(true);
    setDeploymentStatus('Connecting to wallet…');
    const notifId = addNotification({ type: 'loading', title: 'Deploying Contract', message: 'Waiting for wallet approval…', duration: 0 });

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      // Ensure correct network
      const currentNetwork = await provider.getNetwork();
      if (Number(currentNetwork.chainId) !== network.chainId) {
        setDeploymentStatus('Switching network…');
        updateNotification(notifId, { type: 'loading', title: 'Deploying Contract', message: `Switching to ${network.name}…`, duration: 0 });
        try {
          await (window as any).ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${network.chainId.toString(16)}` }] });
        } catch (switchErr: any) {
          if (switchErr.code === 4902) {
            await (window as any).ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: `0x${network.chainId.toString(16)}`, chainName: network.name, rpcUrls: [network.rpcUrl], nativeCurrency: { name: network.symbol, symbol: network.symbol, decimals: 18 }, blockExplorerUrls: [network.explorerUrl] }] });
          } else throw switchErr;
        }
      }

      setDeploymentStatus('Waiting for signature…');
      updateNotification(notifId, { type: 'loading', title: 'Deploying Contract', message: 'Please confirm in your wallet…', duration: 0 });

      const factory = new ethers.ContractFactory(compilationResult.abi, compilationResult.bytecode, signer);

      // Constructor: (string _name, string _symbol, string _initBaseURI, string _initHiddenURI)
      const constructorArgs: string[] = [
        advancedContractConfig.name,
        advancedContractConfig.symbol,
        advancedContractConfig.advanced.baseURI || '',
        advancedContractConfig.advanced.hiddenURI || '',
      ];

      const contract = await factory.deploy(...constructorArgs);
      const txHash = contract.deploymentTransaction()?.hash || '';
      setTxHash(txHash);
      setDeploymentStatus('Mining transaction…');
      updateNotification(notifId, { type: 'loading', title: 'Mining…', message: `TX: ${txHash.slice(0, 12)}…`, duration: 0 });

      const deployed = await contract.waitForDeployment();
      const address = await deployed.getAddress();

      setDeployedAddress(address);
      setDeploymentStatus(`Deployed at ${address}`);
      updateNotification(notifId, { type: 'success', title: 'Contract Deployed!', message: `Address: ${address.slice(0, 10)}…`, duration: 8000 });
      addNotification({ type: 'success', title: 'View on Explorer', message: `${network.explorerUrl}/address/${address}`, duration: 0 });

      // Persist to server
      await fetch('/api/contract/deployments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: walletAddress, networkId: network.chainId, contractAddress: address, contractType: advancedContractConfig.type, name: advancedContractConfig.name, symbol: advancedContractConfig.symbol, txHash }),
      });
    } catch (err: any) {
      const msg = err.code === 4001 ? 'Transaction rejected by user.' : (err.message || 'Deployment failed');
      setDeploymentStatus(`Failed: ${msg}`);
      updateNotification(notifId, { type: 'error', title: 'Deployment Failed', message: msg, duration: 8000 });
    } finally {
      setIsDeploying(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addNotification({ type: 'success', title: 'Copied', message: 'Copied to clipboard.', duration: 2000 });
  };

  const SH = ({ icon: Icon, title }: { icon: any; title: string }) => (
    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-800">
      <Icon className="w-4 h-4 text-blue-400" /><h3 className="text-sm font-bold text-white uppercase tracking-wide">{title}</h3>
    </div>
  );

  return (
    <div className="flex flex-col gap-5" style={{ height: 'calc(100vh - 8rem)' }}>
      {/* Progress */}
      <div className="flex items-center gap-2 bg-slate-900 p-4 rounded-xl border border-slate-800">
        {steps.map((step, i) => (
          <React.Fragment key={step}>
            <div className={`flex items-center gap-2 text-sm font-medium ${i <= currentStep ? 'text-white' : 'text-slate-600'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i < currentStep ? 'bg-green-600 text-white' : i === currentStep ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                {i < currentStep ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              <span className="hidden sm:inline">{step}</span>
            </div>
            {i < steps.length - 1 && <div className={`flex-1 h-px ${i < currentStep ? 'bg-green-600/50' : 'bg-slate-800'}`} />}
          </React.Fragment>
        ))}
      </div>

      <div className="flex-1 flex gap-5 min-h-0">
        {/* LEFT: Config */}
        <div className="flex flex-col w-80 flex-shrink-0 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
            <h2 className="font-bold text-white flex items-center gap-2"><Settings className="w-4 h-4" /> Configuration</h2>
            <button onClick={handleGenerate}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5">
              <Code className="w-3.5 h-3.5" /> Generate
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            <section>
              <SH icon={Layers} title="General" />
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Name *</label>
                    <input type="text" value={advancedContractConfig.name} onChange={(e) => updateAdvancedContractConfig({ name: e.target.value })} placeholder="My NFT" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Symbol *</label>
                    <input type="text" value={advancedContractConfig.symbol} onChange={(e) => updateAdvancedContractConfig({ symbol: e.target.value })} placeholder="MNFT" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Standard</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['ERC721', 'ERC721A', 'ERC1155'] as ContractType[]).map((type) => (
                      <button key={type} onClick={() => updateAdvancedContractConfig({ type })}
                        className={`py-2 rounded-lg text-xs font-bold border transition-all ${advancedContractConfig.type === type ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'}`}>
                        {type}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">{advancedContractConfig.type === 'ERC721A' ? 'Optimized batch minting – saves gas.' : advancedContractConfig.type === 'ERC721' ? 'Standard NFT – best marketplace compatibility.' : 'Multi-token standard.'}</p>
                </div>
              </div>
            </section>

            <section>
              <SH icon={Database} title="Supply & Minting" />
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Max Supply</label>
                    <input type="number" value={advancedContractConfig.supply.maxSupply} onChange={(e) => updateAdvancedContractConfig({ supply: { ...advancedContractConfig.supply, maxSupply: parseInt(e.target.value) } })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Mint Price (CRO)</label>
                    <input type="text" value={advancedContractConfig.mint.publicMint.price} onChange={(e) => updateAdvancedContractConfig({ mint: { ...advancedContractConfig.mint, publicMint: { ...advancedContractConfig.mint.publicMint, price: e.target.value } } })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white outline-none" />
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <div>
                    <p className="text-sm text-white font-medium">Allowlist Minting</p>
                    <p className="text-[10px] text-slate-500">Merkle-proof gated mint phase</p>
                  </div>
                  <button onClick={() => updateAdvancedContractConfig({ mint: { ...advancedContractConfig.mint, allowlistMint: { ...advancedContractConfig.mint.allowlistMint, enabled: !advancedContractConfig.mint.allowlistMint.enabled } } })}
                    className={`w-9 h-5 rounded-full transition-colors relative ${advancedContractConfig.mint.allowlistMint.enabled ? 'bg-blue-600' : 'bg-slate-700'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${advancedContractConfig.mint.allowlistMint.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                </div>
              </div>
            </section>

            <section>
              <SH icon={Shield} title="Advanced Features" />
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'isRevealed', label: 'Reveal System', desc: 'Hidden until reveal' },
                  { key: 'isBurnable', label: 'Burnable', desc: 'Holders can burn' },
                  { key: 'isPausable', label: 'Pausable', desc: 'Owner can pause' },
                  { key: 'isSoulbound', label: 'Soulbound', desc: 'Non-transferable' },
                ].map(({ key, label, desc }) => {
                  const val = advancedContractConfig.advanced[key as keyof typeof advancedContractConfig.advanced] as boolean;
                  return (
                    <button key={key} onClick={() => updateAdvancedContractConfig({ advanced: { ...advancedContractConfig.advanced, [key]: !val } })}
                      className={`p-2.5 rounded-lg border text-left transition-all ${val ? 'bg-blue-900/20 border-blue-500/50' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-semibold text-white">{label}</span>
                        {val && <CheckCircle className="w-3.5 h-3.5 text-blue-400" />}
                      </div>
                      <p className="text-[10px] text-slate-500">{desc}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <SH icon={Zap} title="URIs" />
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Base URI {ipfsCid && <span className="text-green-400">(auto-filled from IPFS)</span>}</label>
                  <input type="text" value={advancedContractConfig.advanced.baseURI} onChange={(e) => updateAdvancedContractConfig({ advanced: { ...advancedContractConfig.advanced, baseURI: e.target.value } })} placeholder="ipfs://..." className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-blue-500 outline-none font-mono" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Hidden URI (pre-reveal)</label>
                  <input type="text" value={advancedContractConfig.advanced.hiddenURI} onChange={(e) => updateAdvancedContractConfig({ advanced: { ...advancedContractConfig.advanced, hiddenURI: e.target.value } })} placeholder="ipfs://..." className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-blue-500 outline-none font-mono" />
                </div>
              </div>
            </section>

            <section>
              <SH icon={Globe} title="Social & Website Links" />
              <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">
                Optional metadata embedded as comments in the Solidity source for on-chain reference.
              </p>
              <div className="space-y-2">
                <div>
                  <label className="flex items-center gap-1 text-xs text-slate-400 mb-1"><Globe className="w-3 h-3" /> Website</label>
                  <input type="url" value={socialLinks.website} onChange={e => updateSocial('website', e.target.value)} placeholder="https://myproject.io" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="flex items-center gap-1 text-xs text-slate-400 mb-1"><Twitter className="w-3 h-3" /> Twitter / X</label>
                  <input type="url" value={socialLinks.twitter} onChange={e => updateSocial('twitter', e.target.value)} placeholder="https://twitter.com/myproject" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="flex items-center gap-1 text-xs text-slate-400 mb-1"><MessageCircle className="w-3 h-3" /> Telegram</label>
                  <input type="url" value={socialLinks.telegram} onChange={e => updateSocial('telegram', e.target.value)} placeholder="https://t.me/myproject" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="flex items-center gap-1 text-xs text-slate-400 mb-1"><Github className="w-3 h-3" /> GitHub</label>
                  <input type="url" value={socialLinks.github} onChange={e => updateSocial('github', e.target.value)} placeholder="https://github.com/myproject" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="flex items-center gap-1 text-xs text-slate-400 mb-1">Description</label>
                  <textarea value={socialLinks.description} onChange={e => updateSocial('description', e.target.value)} placeholder="A short description of your NFT project…" rows={2} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-blue-500 outline-none resize-none" />
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* RIGHT: Preview + Deploy */}
        <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
            <div className="flex gap-1">
              {(['preview', 'deploy'] as const).map((t) => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${activeTab === t ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
                  {t === 'preview' ? 'Source Code' : 'Deploy'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {generatedSource && (
                <button onClick={handleCompile} disabled={isCompiling}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-1.5">
                  {isCompiling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  {isCompiling ? 'Compiling…' : 'Compile'}
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            {activeTab === 'preview' && (
              <div className="h-full overflow-auto p-4 bg-[#1e1e1e]">
                {generatedSource ? (
                  <>
                    <div className="flex justify-end mb-2">
                      <button onClick={() => copyToClipboard(generatedSource)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors">
                        <Copy className="w-3 h-3" /> Copy source
                      </button>
                    </div>
                    <pre className="font-mono text-xs text-green-300 leading-relaxed whitespace-pre-wrap">{generatedSource}</pre>
                  </>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600">
                    <Code className="w-12 h-12 mb-4 opacity-20" />
                    <p className="text-sm">Configure your contract and click "Generate" to see the Solidity source</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'deploy' && (
              <div className="h-full overflow-auto p-6 space-y-5">
                {!compilationResult ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                    <AlertTriangle className="w-10 h-10 mb-3 opacity-30" />
                    <p>Generate and compile your contract first.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                        <p className="text-xs text-slate-500 mb-1">Network</p>
                        <p className="text-white font-semibold">{network.name}</p>
                        <p className="text-xs text-slate-500">Chain ID: {network.chainId}</p>
                      </div>
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                        <p className="text-xs text-slate-500 mb-1">Estimated Gas</p>
                        <p className="text-white font-semibold">{gasEstimate || '~2,500,000'}</p>
                        <p className="text-xs text-slate-500">Units</p>
                      </div>
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                        <p className="text-xs text-slate-500 mb-1">ABI Functions</p>
                        <p className="text-white font-semibold">{compilationResult.abi.filter((i: any) => i.type === 'function').length}</p>
                      </div>
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                        <p className="text-xs text-slate-500 mb-1">Bytecode Size</p>
                        <p className="text-white font-semibold">{Math.round(compilationResult.bytecode.length / 2 / 1024)}KB</p>
                      </div>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                      <p className="text-xs text-slate-500 uppercase font-medium">Constructor Arguments</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-slate-500">Name:</span> <span className="text-white ml-1">{advancedContractConfig.name || '—'}</span></div>
                        <div><span className="text-slate-500">Symbol:</span> <span className="text-white ml-1">{advancedContractConfig.symbol || '—'}</span></div>
                        <div className="col-span-2"><span className="text-slate-500">Base URI:</span> <span className="text-white ml-1 font-mono break-all">{advancedContractConfig.advanced.baseURI || '(empty)'}</span></div>
                        <div className="col-span-2"><span className="text-slate-500">Hidden URI:</span> <span className="text-white ml-1 font-mono break-all">{advancedContractConfig.advanced.hiddenURI || '(empty)'}</span></div>
                      </div>
                    </div>

                    {deployedAddress ? (
                      <div className="bg-green-500/10 border border-green-500/30 p-5 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <CheckCircle className="w-5 h-5 text-green-400" />
                          <p className="font-bold text-green-400">Deployed Successfully</p>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400">Contract Address</span>
                            <div className="flex items-center gap-2">
                              <span className="text-white font-mono text-xs">{deployedAddress.slice(0, 10)}…{deployedAddress.slice(-8)}</span>
                              <button onClick={() => copyToClipboard(deployedAddress)}><Copy className="w-3 h-3 text-slate-400 hover:text-white" /></button>
                              <a href={`${network.explorerUrl}/address/${deployedAddress}`} target="_blank" rel="noreferrer"><ExternalLink className="w-3 h-3 text-blue-400 hover:text-blue-300" /></a>
                            </div>
                          </div>
                          {txHash && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-400">TX Hash</span>
                              <a href={`${network.explorerUrl}/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 font-mono text-xs">{txHash.slice(0, 10)}… <ExternalLink className="w-3 h-3 inline" /></a>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <button onClick={handleDeploy} disabled={isDeploying || !walletAddress}
                        className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-3 shadow-lg">
                        {isDeploying ? <><RefreshCw className="w-5 h-5 animate-spin" />{deploymentStatus}</> : <><Rocket className="w-5 h-5" />Deploy to {network.name}</>}
                      </button>
                    )}
                    {!walletAddress && <p className="text-center text-xs text-yellow-400 flex items-center justify-center gap-1"><AlertTriangle className="w-3 h-3" /> Connect wallet to deploy</p>}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export default ContractBuilder;
