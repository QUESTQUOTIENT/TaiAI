import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Layers, FileJson, Cloud, FileCode, Zap, Store,
  BarChart3, Settings, Info, Coins, ChevronLeft, ChevronRight,
  ArrowLeftRight, Droplets, Rocket, Image, Wand2, Globe, CircleDot,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAppStore } from '../store';
import { isSolanaNetwork } from '../types';


const NFT_WORKFLOW = [
  { name: 'Dashboard',     icon: LayoutDashboard, path: '/' },
  { name: 'NFT Engine',    icon: Layers,          path: '/assets' },
  { name: 'Metadata',      icon: FileJson,        path: '/metadata' },
  { name: 'IPFS',          icon: Cloud,           path: '/ipfs' },
];


const NFT_WORKFLOW_EVM = [
  { name: 'Contract',      icon: FileCode,        path: '/contract' },
  { name: 'Deploy Wizard', icon: Wand2,           path: '/deploy',   badge: '✦' },
];


const NFT_WORKFLOW_SHARED = [
  { name: 'Minting',       icon: Zap,             path: '/minting' },
  { name: 'NFT Gallery',   icon: Image,           path: '/gallery',  badge: 'NEW' },
  { name: 'Marketplace',   icon: Store,           path: '/marketplace' },
  { name: 'Analytics',     icon: BarChart3,       path: '/analytics' },
];

const LAUNCHPAD = [
  { name: 'Launchpad', icon: Rocket, path: '/launchpad' },
];


const DEFI_EVM = [
  { name: 'Swap',          icon: ArrowLeftRight, path: '/swap',      badge: 'VVS' },
  { name: 'Liquidity',     icon: Droplets,       path: '/liquidity', badge: 'VVS' },
  { name: 'Token Builder', icon: Coins,          path: '/token',     badge: 'ERC20' },
];


const DEFI_SOLANA = [
  { name: 'Swap',          icon: ArrowLeftRight, path: '/swap',      badge: 'JUP' },
  { name: 'Liquidity',     icon: Droplets,       path: '/liquidity', badge: 'RAY' },
  { name: 'Token Builder', icon: Coins,          path: '/token',     badge: 'SPL' },
];

const SYSTEM = [
  { name: 'Settings', icon: Settings, path: '/settings' },
  { name: 'About',    icon: Info,     path: '/about' },
];

type NavItem = { name: string; icon: React.ComponentType<{ className?: string }>; path: string; badge?: string };

function NavGroup({
  title, items, collapsed, accent, solana,
}: {
  title: string;
  items: NavItem[];
  collapsed: boolean;
  accent?: boolean;
  solana?: boolean;
}) {
  return (
    <div>
      {!collapsed && (
        <p className={cn(
          'text-[9px] uppercase font-bold tracking-widest px-3 pt-3 pb-1.5',
          accent   ? 'text-blue-500/70'   :
          solana   ? 'text-purple-500/70' :
                     'text-slate-600',
        )}>{title}</p>
      )}
      {collapsed && <div className="border-t border-slate-800/50 my-1.5" />}
      {items.map((item) => {
        const badgeColor = solana
          ? 'bg-purple-500/20 text-purple-300 border-purple-500/20'
          : 'bg-blue-500/20 text-blue-300 border-blue-500/20';

        return (
          <NavLink
            key={item.path + item.name}
            to={item.path}
            end={item.path === '/'}
            title={collapsed ? item.name : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 mx-1',
                collapsed ? 'justify-center' : '',
                solana && !isActive ? 'text-purple-300/80 hover:bg-purple-500/10 hover:text-purple-200' : '',
                accent && !isActive  ? 'text-blue-400 hover:bg-blue-500/10 hover:text-blue-300' : '',
                !accent && !solana && !isActive ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : '',
                isActive
                  ? solana
                    ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-md shadow-purple-900/40'
                    : accent
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md shadow-blue-900/40'
                      : 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                  : '',
              )
            }
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span className="flex-1">{item.name}</span>}
            {!collapsed && item.badge && (
              <span className={cn('text-[9px] font-black px-1.5 py-0.5 rounded border', badgeColor)}>
                {item.badge}
              </span>
            )}
          </NavLink>
        );
      })}
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 768
  );

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      document.documentElement.style.setProperty('--sidebar-width', mobile ? '0rem' : (collapsed ? '4rem' : '16rem'));
      if (mobile) setCollapsed(false);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [collapsed]);

  
  useEffect(() => {
    const handler = () => setMobileOpen(prev => !prev);
    window.addEventListener('toggle-sidebar', handler);
    return () => window.removeEventListener('toggle-sidebar', handler);
  }, []);

  const { network, walletAddress, solanaWalletAddress } = useAppStore();
  const isSolana = isSolanaNetwork(network);

  
  const nftItems: NavItem[] = isSolana
    ? [...NFT_WORKFLOW, ...NFT_WORKFLOW_SHARED]
    : [...NFT_WORKFLOW, ...NFT_WORKFLOW_EVM, ...NFT_WORKFLOW_SHARED];

  const defiItems: NavItem[] = isSolana ? DEFI_SOLANA : DEFI_EVM;
  const defiLabel = isSolana ? '◎ Solana DeFi' : 'DeFi Tools';

  
  const navCollapsed = isMobile ? false : collapsed;

  return (
    <>
      {}
      {isMobile && mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    <div
      className={`fixed left-0 top-0 h-full border-r border-slate-800 flex flex-col z-40 transition-all duration-300 overflow-hidden`}
      style={{
        width: isMobile ? (mobileOpen ? '16rem' : '0rem') : (collapsed ? '4rem' : '16rem'),
        background: 'var(--bg-sidebar, #0b1120)',
      }}
    >
      {}
      <div className="flex items-center gap-3 px-3 py-4 border-b border-slate-800/70">
        <img
          src="/logo.svg"
          alt="Crolana"
          className="w-8 h-8 rounded-lg flex-shrink-0 object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        {!navCollapsed && (
          <div className="min-w-0">
            <h1 className="text-sm font-black text-white leading-tight tracking-tight">Crolana</h1>
          </div>
        )}
      </div>

      {}
      {isSolana && !navCollapsed && (
        <div className="mx-2 mt-2 px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg flex items-center gap-2">
          <span className="text-purple-400 text-xs">◎</span>
          <span className="text-purple-300 text-[10px] font-bold uppercase tracking-wider">
            {network.isTestnet ? 'Devnet' : 'Mainnet'}
          </span>
          <span className="ml-auto text-[9px] text-purple-400/60 font-bold">SOL</span>
        </div>
      )}

      {}
      <nav className="flex-1 py-2 overflow-y-auto">
        <NavGroup
          title={isSolana ? '◎ NFT Workflow' : 'NFT Workflow'}
          items={nftItems}
          collapsed={navCollapsed}
          solana={isSolana}
        />
        <NavGroup
          title="🚀 Launchpad"
          items={LAUNCHPAD}
          collapsed={navCollapsed}
          accent={!isSolana}
          solana={isSolana && false}
        />
        <NavGroup
          title={defiLabel}
          items={defiItems}
          collapsed={navCollapsed}
          solana={isSolana}
        />
        <NavGroup title="System" items={SYSTEM} collapsed={navCollapsed} />
      </nav>

      {}
      {!navCollapsed && (
        <div className="p-3 border-t border-slate-800 space-y-2">
          <div className="bg-slate-800/60 rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <div className={cn('w-2 h-2 rounded-full flex-shrink-0',
                isSolana
                  ? (network.isTestnet ? 'bg-orange-400' : 'bg-purple-400')
                  : (network.isTestnet ? 'bg-yellow-400' : 'bg-green-400'),
              )} />
              <span className="text-xs text-slate-300 font-medium truncate">{network.name}</span>
              {isSolana && <span className="text-[9px] text-purple-400 font-bold">◎</span>}
            </div>
            {(walletAddress || solanaWalletAddress) && (() => {
              const addr = isSolana ? solanaWalletAddress : walletAddress;
              return addr ? (
                <p className="text-[10px] text-slate-500 font-mono truncate">
                  {addr.slice(0, 8)}…{addr.slice(-4)}
                </p>
              ) : null;
            })()}
          </div>
          <div className="px-0.5">
            <p className="text-[9px] text-slate-700 uppercase tracking-widest font-semibold">Built by</p>
            <p className="text-xs font-black text-slate-600 tracking-wide">XTAMATA</p>
          </div>
        </div>
      )}

      {}
      <button
        onClick={() => {
          if (isMobile) {
            setMobileOpen(!mobileOpen);
          } else {
            const next = !collapsed;
            setCollapsed(next);
            document.documentElement.style.setProperty(
              '--sidebar-width',
              next ? '4rem' : '16rem'
            );
          }
        }}
        className="absolute -right-4 top-20 w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-400 hover:text-white hover:bg-blue-600 hover:border-blue-500 transition-all z-10 shadow-lg"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {(isMobile ? !mobileOpen : collapsed) ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </div>
    </>
  );
}
