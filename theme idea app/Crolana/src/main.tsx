
import './polyfills';



const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
if (SENTRY_DSN) {
  import('@sentry/react').then(({ init, browserTracingIntegration }) => {
    init({
      dsn:          SENTRY_DSN,
      environment:  import.meta.env.MODE ?? 'production',
      integrations: [browserTracingIntegration()],
      tracesSampleRate: 0.1,
      
      ignoreErrors: ['SES_UNCAUGHT_EXCEPTION', /can't access property.*BN/],
    });
  }).catch(() => { /* Sentry unavailable — silent fail */ });
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { useAppStore } from './store';
import { initializeCapacitor, configureStatusBar } from './lib/capacitor';
import { initializeWalletConnect } from './lib/walletconnect';

// Apply saved/default theme CSS variables on first load
// FIXED: use bootTheme (localStorage) not the store default
const { theme: storeTheme } = useAppStore.getState();
let bootTheme = storeTheme;
try {
  const saved = localStorage.getItem('crolana-theme');
  if (saved) {
    const p = JSON.parse(saved);
    if (p.bgBase && p.accentPrimary) {
      if (!p.bgRaised) p.bgRaised = p.bgSurface; // back-fill
      bootTheme = p;
    }
  }
} catch {}
const r = document.documentElement;
r.style.setProperty('--bg-base',        bootTheme.bgBase);
r.style.setProperty('--bg-surface',     bootTheme.bgSurface);
r.style.setProperty('--bg-elevated',    bootTheme.bgElevated);
r.style.setProperty('--bg-sidebar',     bootTheme.bgSidebar);
r.style.setProperty('--bg-raised',      bootTheme.bgRaised ?? bootTheme.bgSurface);
r.style.setProperty('--border-color',   bootTheme.borderColor);
r.style.setProperty('--text-primary',   bootTheme.textPrimary);
r.style.setProperty('--text-secondary', bootTheme.textSecondary);
r.style.setProperty('--text-muted',     bootTheme.textMuted);
r.style.setProperty('--accent-primary', bootTheme.accentPrimary);
r.style.setProperty('--accent-hover',   bootTheme.accentHover);
r.style.setProperty('--accent-text',    bootTheme.accentText);
r.style.setProperty('--color-success',  bootTheme.colorSuccess);
r.style.setProperty('--color-warning',  bootTheme.colorWarning);
r.style.setProperty('--color-error',    bootTheme.colorError);
r.style.setProperty('--color-info',     bootTheme.colorInfo);

// Initialize Capacitor native integrations
initializeCapacitor().catch(console.error);

// Initialize WalletConnect to sync any persisted session
initializeWalletConnect().catch(console.error);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
