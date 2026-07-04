import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BackButtonHandler } from './components/BackButtonHandler';




const Dashboard        = React.lazy(() => import('./pages/Dashboard'));
const AssetCreation    = React.lazy(() => import('./pages/AssetCreation'));
const MetadataBuilder  = React.lazy(() => import('./pages/MetadataBuilder'));
const IpfsManager      = React.lazy(() => import('./pages/IpfsManager'));
const ContractBuilder  = React.lazy(() => import('./pages/ContractBuilder'));
const DeployWizard     = React.lazy(() => import('./pages/DeployWizard'));
const MintingDashboard = React.lazy(() => import('./pages/MintingDashboard'));
const NFTGallery       = React.lazy(() => import('./pages/NFTGallery'));
const MarketplacePrep  = React.lazy(() => import('./pages/MarketplacePrep'));
const Analytics        = React.lazy(() => import('./pages/Analytics'));
const Settings         = React.lazy(() => import('./pages/Settings'));
const About            = React.lazy(() => import('./pages/About'));
const TokenBuilderPage = React.lazy(() => import('./pages/TokenBuilderPage'));
const SwapPage         = React.lazy(() => import('./pages/SwapPage'));
const LiquidityManager = React.lazy(() => import('./pages/LiquidityManager'));
const Launchpad        = React.lazy(() => import('./pages/Launchpad'));



const SolanaLiquidity    = React.lazy(() => import('./pages/SolanaLiquidity'));
const SolanaTokenBuilder = React.lazy(() => import('./pages/SolanaTokenBuilder'));
const SolanaAnalytics    = React.lazy(() => import('./pages/SolanaAnalytics'));
const SolanaMinting      = React.lazy(() => import('./pages/SolanaMinting'));
const PublicMint         = React.lazy(() => import('./pages/PublicMint'));


import { useAppStore }     from './store';
import { isSolanaNetwork } from './types';

function NetworkRoute({ evm: Evm, sol: Sol }: { evm: React.ComponentType; sol: React.ComponentType }) {
  const { network } = useAppStore();
  return isSolanaNetwork(network) ? <Sol /> : <Evm />;
}

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary inline={false}>
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-64">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      }>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <BackButtonHandler />
        <Routes>
          {}
          <Route path="/mint" element={
            <PageWrapper><PublicMint /></PageWrapper>
          } />
          <Route path="/" element={<Layout />}>
            <Route index             element={<PageWrapper><Dashboard /></PageWrapper>} />
            <Route path="assets"     element={<PageWrapper><AssetCreation /></PageWrapper>} />
            <Route path="metadata"   element={<PageWrapper><MetadataBuilder /></PageWrapper>} />
            <Route path="ipfs"       element={<PageWrapper><IpfsManager /></PageWrapper>} />
            <Route path="contract"   element={<PageWrapper><ContractBuilder /></PageWrapper>} />
            <Route path="deploy"     element={<PageWrapper><DeployWizard /></PageWrapper>} />
            <Route path="minting"    element={<PageWrapper><NetworkRoute evm={MintingDashboard} sol={SolanaMinting} /></PageWrapper>} />
            <Route path="gallery"    element={<PageWrapper><NFTGallery /></PageWrapper>} />
            <Route path="marketplace" element={<PageWrapper><MarketplacePrep /></PageWrapper>} />
            <Route path="analytics"  element={<PageWrapper><NetworkRoute evm={Analytics} sol={SolanaAnalytics} /></PageWrapper>} />
            <Route path="launchpad"  element={<PageWrapper><Launchpad /></PageWrapper>} />
            <Route path="swap"       element={<PageWrapper><SwapPage /></PageWrapper>} />
            <Route path="liquidity"  element={<PageWrapper><NetworkRoute evm={LiquidityManager} sol={SolanaLiquidity} /></PageWrapper>} />
            <Route path="token"      element={<PageWrapper><NetworkRoute evm={TokenBuilderPage} sol={SolanaTokenBuilder} /></PageWrapper>} />
            <Route path="settings"   element={<PageWrapper><Settings /></PageWrapper>} />
            <Route path="about"      element={<PageWrapper><About /></PageWrapper>} />
            <Route path="*" element={
              <div className="flex flex-col items-center justify-center min-h-64 gap-4">
                <p className="text-6xl font-black text-slate-800">404</p>
                <p className="text-slate-400">Page not found</p>
                <a href="/" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
                  Back to Dashboard
                </a>
              </div>
            } />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
