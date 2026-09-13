import React, { useState, useEffect } from 'react';
import { 
  Menu, 
  Cloud, 
  CheckCircle2, 
  CloudOff, 
  Terminal, 
  LogOut, 
  User as UserIcon, 
  ChevronDown, 
  Folder,
  Sun,
  Moon
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuthStore } from '../../store/useAuthStore';
import { useUIStore } from '../../store/useUIStore';
import { db } from '../../db/indexedDb';
import { SettingsModal } from '../modals/SettingsModal';
import { syncService } from '../../services/syncService';

export const Header: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { 
    toggleSidebar, 
    syncStatus, 
    isTerminalOpen, 
    toggleTerminal,
    activeNotebookId,
    theme,
    toggleTheme
  } = useUIStore();

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  // Close profile dropdown on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsProfileOpen(false);
    };
    if (isProfileOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isProfileOpen]);

  // Live active note details for breadcrumb
  const activeNote = useLiveQuery(
    () => (activeNotebookId ? db.notes.get(activeNotebookId) : undefined),
    [activeNotebookId]
  );

  // Live count of pending unsynced changes in IndexedDB
  const pendingCount = useLiveQuery(() => db.syncQueue.count(), []) || 0;

  // Trigger manual batch backup across all notes
  const handleSyncClick = async () => {
    if (syncStatus === 'saving' || isManualSyncing) return;
    setIsManualSyncing(true);
    try {
      await syncService.performSync(pendingCount === 0);
    } finally {
      setIsManualSyncing(false);
    }
  };

  // Sync button state & styling
  const isSyncInProgress = syncStatus === 'saving' || isManualSyncing;

  let syncPill = {
    icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />,
    text: 'Backed up',
    classes: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20 active:scale-95 cursor-pointer',
    title: 'All notes backed up. Click to verify and sync all notes.',
    disabled: false
  };

  if (isSyncInProgress) {
    syncPill = {
      icon: <Cloud className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 animate-pulse" />,
      text: 'Backing up...',
      classes: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 cursor-wait',
      title: 'Backing up all notes to cloud...',
      disabled: true
    };
  } else if (syncStatus === 'offline') {
    syncPill = {
      icon: <CloudOff className="w-3.5 h-3.5 text-slate-400" />,
      text: 'Offline',
      classes: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20 cursor-default',
      title: 'Offline mode. Changes are saved safely in local browser database.',
      disabled: true
    };
  } else if (syncStatus === 'error') {
    syncPill = {
      icon: <CloudOff className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />,
      text: 'Sync Error • Retry',
      classes: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30 hover:bg-red-500/25 active:scale-95 cursor-pointer',
      title: 'Sync encountered an issue. Click to retry backing up all notes.',
      disabled: false
    };
  } else if (pendingCount > 0) {
    syncPill = {
      icon: <Cloud className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />,
      text: 'Backup Now',
      classes: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40 hover:bg-amber-500/25 shadow-sm shadow-amber-500/10 active:scale-95 cursor-pointer font-semibold',
      title: `${pendingCount} pending change${pendingCount > 1 ? 's' : ''}. Click to backup all notes now`,
      disabled: false
    };
  }

  return (
    <>
      <header className="h-13 bg-dark-850 border-b border-dark-600/70 px-4 flex items-center justify-between select-none z-20">
        {/* Left section: Hamburger & Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Toggle Sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 truncate">
              <Folder className="w-3.5 h-3.5 text-[#6d5dfc] shrink-0" />
              <span className="truncate max-w-[120px] font-medium">
                {activeNote?.folder && activeNote.folder !== 'root' ? activeNote.folder : 'root'}
              </span>
              <span className="text-slate-600">/</span>
              <span className="font-semibold text-slate-100 truncate max-w-[200px] md:max-w-[320px]">
                {activeNote?.title || 'Untitled Notebook'}
              </span>
            </div>

            {/* Sync button / badge */}
            <button
              onClick={handleSyncClick}
              disabled={syncPill.disabled}
              title={syncPill.title}
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] border font-medium transition-all ${syncPill.classes}`}
            >
              {syncPill.icon}
              <span>{syncPill.text}</span>
            </button>
          </div>
        </div>

        {/* Right section: Terminal trigger & Profile menu */}
        <div className="flex items-center gap-2">
          {/* Toggle Terminal */}
          <button
            onClick={toggleTerminal}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              isTerminalOpen 
                ? 'bg-[#6d5dfc]/20 text-[#818cf8] border-[#6d5dfc]/40 shadow-sm shadow-[#6d5dfc]/20' 
                : 'bg-dark-800 hover:bg-dark-700 text-slate-300 hover:text-white border-dark-600'
            }`}
            title="Toggle Interactive Terminal Drawer"
          >
            <Terminal className="w-3.5 h-3.5 text-accent-light" />
            <span className="hidden sm:inline">Terminal</span>
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-dark-800 hover:bg-dark-700 text-slate-300 hover:text-white border border-dark-600 transition-all cursor-pointer"
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {theme === 'light' ? (
              <>
                <Moon className="w-3.5 h-3.5 text-[#818cf8]" />
                <span className="hidden sm:inline">Dark</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Light</span>
              </>
            )}
          </button>

          {/* User Profile dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-2 p-1.5 pl-2 rounded-xl hover:bg-dark-700 border border-transparent hover:border-dark-600 transition-all cursor-pointer"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#6d5dfc] to-indigo-400 flex items-center justify-center text-xs font-bold text-white uppercase shadow-md shadow-[#6d5dfc]/20">
                {user?.username ? user.username.charAt(0) : 'U'}
              </div>
              <span className="hidden md:inline text-xs font-medium text-slate-300 max-w-[100px] truncate">
                {user?.username || 'User'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {isProfileOpen && (
              <>
                {/* Full screen click-outside backdrop */}
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsProfileOpen(false)} 
                />
                <div className="absolute right-0 mt-2 w-56 bg-dark-800 border border-dark-600 rounded-2xl shadow-2xl py-1.5 text-sm z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-3.5 py-2.5 border-b border-dark-600">
                  <p className="font-semibold text-white text-xs truncate">{user?.username}</p>
                  <p className="text-slate-400 text-[11px] truncate">{user?.email}</p>
                  <span className="inline-block mt-1.5 text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#6d5dfc]/20 text-[#818cf8] border border-[#6d5dfc]/30">
                    {user?.role || 'User'}
                  </span>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      toggleTheme();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-300 hover:bg-dark-700 hover:text-white flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      {theme === 'light' ? (
                        <Moon className="w-3.5 h-3.5 text-[#818cf8]" />
                      ) : (
                        <Sun className="w-3.5 h-3.5 text-amber-400" />
                      )}
                      <span>{theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}</span>
                    </div>
                    <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-dark-700 text-slate-400">
                      {theme}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      setIsSettingsOpen(true);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-300 hover:bg-dark-700 hover:text-white flex items-center gap-2 cursor-pointer"
                  >
                    <UserIcon className="w-3.5 h-3.5" />
                    Account Settings
                  </button>
                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      logout();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              </div>
            </>
          )}
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
};
