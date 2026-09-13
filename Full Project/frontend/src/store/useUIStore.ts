import { create } from 'zustand';

export type SyncStatus = 'synced' | 'saving' | 'offline' | 'error';
export type Theme = 'dark' | 'light';

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem('zoho-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    const isLightLegacy = localStorage.getItem('theme-light') === 'true';
    return isLightLegacy ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function applyThemeToDOM(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const body = document.body;
  if (theme === 'light') {
    root.classList.remove('dark');
    root.classList.add('light');
    body.classList.add('light-theme');
  } else {
    root.classList.remove('light');
    root.classList.add('dark');
    body.classList.remove('light-theme');
  }
}

const initialTheme = getInitialTheme();
applyThemeToDOM(initialTheme);

function getInitialSidebarWidth(): number {
  try {
    const saved = localStorage.getItem('zoho-sidebar-width');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 180 && parsed <= 700) {
        return parsed;
      }
    }
  } catch {}
  return 256;
}

interface UIState {
  isSidebarOpen: boolean;
  sidebarWidth: number;
  activeNotebookId: string | null;
  activeCellId: string | null;
  isTerminalOpen: boolean;
  terminalHeight: number;
  syncStatus: SyncStatus;
  searchQuery: string;
  theme: Theme;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setActiveNotebookId: (id: string | null) => void;
  setActiveCellId: (id: string | null) => void;
  toggleTerminal: () => void;
  setTerminalOpen: (open: boolean) => void;
  setTerminalHeight: (height: number) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setSearchQuery: (query: string) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: true,
  sidebarWidth: getInitialSidebarWidth(),
  activeNotebookId: null,
  activeCellId: null,
  isTerminalOpen: false,
  terminalHeight: 240,
  syncStatus: 'synced',
  searchQuery: '',
  theme: initialTheme,

  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
  setSidebarWidth: (width) => {
    const clamped = Math.min(Math.max(width, 180), 700);
    try {
      localStorage.setItem('zoho-sidebar-width', clamped.toString());
    } catch {}
    set({ sidebarWidth: clamped });
  },
  setActiveNotebookId: (id) => set({ activeNotebookId: id }),
  setActiveCellId: (id) => set({ activeCellId: id }),
  toggleTerminal: () => set((state) => ({ isTerminalOpen: !state.isTerminalOpen })),
  setTerminalOpen: (open) => set({ isTerminalOpen: open }),
  setTerminalHeight: (height) => set({ terminalHeight: height }),
  setSyncStatus: (status) => set({ syncStatus: status }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setTheme: (theme) => {
    try {
      localStorage.setItem('zoho-theme', theme);
      localStorage.setItem('theme-light', theme === 'light' ? 'true' : 'false');
    } catch {}
    applyThemeToDOM(theme);
    set({ theme });
  },
  toggleTheme: () => {
    set((state) => {
      const nextTheme = state.theme === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('zoho-theme', nextTheme);
        localStorage.setItem('theme-light', nextTheme === 'light' ? 'true' : 'false');
      } catch {}
      applyThemeToDOM(nextTheme);
      return { theme: nextTheme };
    });
  }
}));
