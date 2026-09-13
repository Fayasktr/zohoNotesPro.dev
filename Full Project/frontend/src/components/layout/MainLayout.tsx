import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { TerminalDrawer } from '../terminal/TerminalDrawer';
import { useBackgroundSync } from '../../hooks/useBackgroundSync';

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Global periodic and event-driven Atlas backup
  useBackgroundSync(15000);
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-dark-900 text-slate-100">
      {/* Collapsible Sidebar */}
      <Sidebar />

      {/* Main Workspace Column */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Header />

        {/* Workspace Canvas Body */}
        <main className="flex-1 overflow-y-auto bg-dark-900 relative">
          {children}
        </main>

        {/* Interactive xterm.js WebSocket Terminal */}
        <TerminalDrawer />
      </div>
    </div>
  );
};
