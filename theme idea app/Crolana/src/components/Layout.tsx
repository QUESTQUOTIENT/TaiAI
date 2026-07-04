import React, { Suspense, lazy } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AIAssistant } from './AIAssistant';

const Notifications = lazy(() => import('./Notifications'));

export function Layout() {
  return (
    <div className="min-h-screen text-slate-200 font-sans" style={{ background: 'var(--bg-base, #020817)' }}>
      <Sidebar />
      {}
      <Header />
      <main
        className="transition-all duration-300 pt-16 min-h-screen"
        style={{ paddingLeft: 'var(--sidebar-width, 16rem)', transition: 'padding-left 0.3s' }}
      >
        {}
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
      <Suspense fallback={null}><Notifications /></Suspense>
      <AIAssistant />
    </div>
  );
}
