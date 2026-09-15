import React, { useState, useMemo } from 'react';
import { 
  Folder, 
  FolderPlus, 
  FolderInput,
  ChevronRight, 
  ChevronDown, 
  PlusSquare, 
  Edit2, 
  Trash2, 
  FileCode, 
  Star, 
  Search, 
  Layers, 
  Globe, 
  Users, 
  RotateCcw, 
  Settings as SettingsIcon,
  MessageCircle,
  X
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/indexedDb';
import { noteRepo } from '../../db/noteRepo';
import { useUIStore } from '../../store/useUIStore';
import { useAuthStore } from '../../store/useAuthStore';
import { Note } from '../../types/note.types';
import { FolderModal } from '../modals/FolderModal';
import { RenameModal } from '../modals/RenameModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import { SettingsModal } from '../modals/SettingsModal';
import { WhatsAppModal } from '../modals/WhatsAppModal';

interface FolderNode {
  name: string;
  fullPath: string;
  subfolders: Record<string, FolderNode>;
  notes: Note[];
}

export const Sidebar: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { 
    isSidebarOpen, 
    sidebarWidth,
    setSidebarWidth,
    activeNotebookId, 
    setActiveNotebookId,
    searchQuery,
    setSearchQuery
  } = useUIStore();

  const [isResizing, setIsResizing] = useState(false);

  // Resize handler for draggable right border
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const maxAllowed = Math.min(650, Math.floor(window.innerWidth * 0.55));
      const newWidth = Math.min(Math.max(startWidth + delta, 180), maxAllowed);
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleResetWidth = () => {
    setSidebarWidth(256); // 256px default width (w-64)
  };

  // Active navigation view: 'notebooks' | 'starred' | 'trash'
  const [activeView, setActiveView] = useState<'notebooks' | 'starred' | 'trash'>('notebooks');
  const [isNotebooksCollapsed, setIsNotebooksCollapsed] = useState(false);

  // Expanded folders persisted in localStorage
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('zoho-expanded-folders');
      return new Set(saved ? JSON.parse(saved) : []);
    } catch {
      return new Set<string>();
    }
  });

  // Persisted empty/custom folders in localStorage so they never disappear
  const [persistedFolders, setPersistedFolders] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('zoho-persisted-folders');
      return new Set(saved ? JSON.parse(saved) : []);
    } catch {
      return new Set<string>();
    }
  });

  const savePersistedFolders = (newFolders: Set<string>) => {
    setPersistedFolders(newFolders);
    try {
      localStorage.setItem('zoho-persisted-folders', JSON.stringify([...newFolders]));
    } catch (_) {}
  };

  // Modal states
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [targetParentFolder, setTargetParentFolder] = useState('root');

  const [renameState, setRenameState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    initialValue: string;
    onConfirm: (val: string) => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    initialValue: '',
    onConfirm: () => {}
  });

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText?: string;
    isDanger?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {}
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);

  // Reactive queries from IndexedDB
  const allNotes = useLiveQuery(
    () => db.notes.filter(n => !n.isTrashed).reverse().sortBy('updatedAt'),
    []
  ) || [];

  const trashedNotes = useLiveQuery(
    () => db.notes.filter(n => !!n.isTrashed).reverse().sortBy('updatedAt'),
    []
  ) || [];

  const starredNotes = useMemo(() => {
    return allNotes.filter(n => n.isStarred);
  }, [allNotes]);

  // Toggle folder expansion
  const toggleFolder = (fullPath: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(fullPath)) {
        next.delete(fullPath);
      } else {
        next.add(fullPath);
      }
      localStorage.setItem('zoho-expanded-folders', JSON.stringify([...next]));
      return next;
    });
  };

  // Filtered notes based on search query (title, folder, or cell contents)
  const matchingNotes = useMemo(() => {
    if (!searchQuery.trim()) return allNotes;
    const q = searchQuery.toLowerCase().trim();
    return allNotes.filter(note => {
      const titleMatch = (note.title || '').toLowerCase().includes(q);
      const folderMatch = (note.folder || '').toLowerCase().includes(q);
      const cellMatch = (note.cells || []).some(c => 
        (c.title || '').toLowerCase().includes(q) || 
        (c.content || '').toLowerCase().includes(q)
      );
      return titleMatch || folderMatch || cellMatch;
    });
  }, [allNotes, searchQuery]);

  // Jump to the first matching note (Original navigateToFirstMatch)
  const handleNavigateToFirstMatch = () => {
    if (matchingNotes.length > 0) {
      setActiveNotebookId(matchingNotes[0].id);
      setActiveView('notebooks');
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleNavigateToFirstMatch();
    } else if (e.key === 'Escape') {
      setSearchQuery('');
    }
  };

  // Build recursive folder tree from matching notes AND persisted folders
  const folderTree = useMemo(() => {
    const root: FolderNode = {
      name: 'root',
      fullPath: '',
      subfolders: {},
      notes: []
    };

    // Pre-populate folders from persistedFolders so empty folders remain visible
    persistedFolders.forEach(folderPath => {
      if (!folderPath || folderPath === 'root') return;
      const parts = folderPath.split('/').filter(Boolean);
      let current = root;
      let pathAccum = '';
      parts.forEach(part => {
        pathAccum = pathAccum ? `${pathAccum}/${part}` : part;
        if (!current.subfolders[part]) {
          current.subfolders[part] = {
            name: part,
            fullPath: pathAccum,
            subfolders: {},
            notes: []
          };
        }
        current = current.subfolders[part];
      });
    });

    matchingNotes.forEach(note => {
      const folderPath = note.folder && note.folder !== 'root' ? note.folder : '';
      if (!folderPath) {
        root.notes.push(note);
        return;
      }

      const parts = folderPath.split('/').filter(Boolean);
      let current = root;
      let pathAccum = '';

      parts.forEach(part => {
        pathAccum = pathAccum ? `${pathAccum}/${part}` : part;
        if (!current.subfolders[part]) {
          current.subfolders[part] = {
            name: part,
            fullPath: pathAccum,
            subfolders: {},
            notes: []
          };
        }
        current = current.subfolders[part];
      });

      current.notes.push(note);
    });

    return root;
  }, [matchingNotes, persistedFolders]);

  // Create new note in folder
  const handleCreateNoteInFolder = async (folderPath: string = 'root') => {
    if (!user) return;
    const newNote = await noteRepo.createNote({
      title: 'Untitled Notebook',
      folder: folderPath
    }, user.id);
    
    // Auto-expand folder
    if (folderPath && folderPath !== 'root') {
      setExpandedFolders(prev => {
        const next = new Set(prev);
        next.add(folderPath);
        localStorage.setItem('zoho-expanded-folders', JSON.stringify([...next]));
        return next;
      });
    }

    setActiveNotebookId(newNote.id);
    setActiveView('notebooks');
  };

  // Open Folder Create Modal
  const handleOpenCreateFolder = (parentPath: string = 'root') => {
    setTargetParentFolder(parentPath);
    setIsFolderModalOpen(true);
  };

  const handleConfirmCreateFolder = async (folderName: string) => {
    const fullPath = targetParentFolder === 'root' || !targetParentFolder 
      ? folderName 
      : `${targetParentFolder}/${folderName}`;

    // Add to persisted folders so it stays rendered even without notes
    const nextFolders = new Set(persistedFolders);
    nextFolders.add(fullPath);
    savePersistedFolders(nextFolders);

    // Auto-expand folder
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.add(fullPath);
      localStorage.setItem('zoho-expanded-folders', JSON.stringify([...next]));
      return next;
    });

    setIsFolderModalOpen(false);
  };

  // Rename Folder
  const handleOpenRenameFolder = (folderPath: string) => {
    const parts = folderPath.split('/');
    const oldName = parts[parts.length - 1];
    setRenameState({
      isOpen: true,
      title: 'Rename Folder',
      description: `Enter a new name for "${oldName}":`,
      initialValue: oldName,
      onConfirm: async (newName: string) => {
        if (!newName || newName === oldName) return;
        const parent = parts.slice(0, -1).join('/');
        const newPath = parent ? `${parent}/${newName}` : newName;
        await noteRepo.renameFolder(folderPath, newPath);

        // Update expanded folders
        setExpandedFolders(prev => {
          const next = new Set<string>();
          for (const p of prev) {
            if (p === folderPath) next.add(newPath);
            else if (p.startsWith(folderPath + '/')) next.add(newPath + p.slice(folderPath.length));
            else next.add(p);
          }
          localStorage.setItem('zoho-expanded-folders', JSON.stringify([...next]));
          return next;
        });

        // Update persisted folders
        const nextPersisted = new Set<string>();
        for (const p of persistedFolders) {
          if (p === folderPath) nextPersisted.add(newPath);
          else if (p.startsWith(folderPath + '/')) nextPersisted.add(newPath + p.slice(folderPath.length));
          else nextPersisted.add(p);
        }
        savePersistedFolders(nextPersisted);
      }
    });
  };

  // Delete Folder
  const handleOpenDeleteFolder = (folderPath: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Folder?',
      description: `Move all notebooks in "${folderPath}" to trash?`,
      confirmText: 'Move to Trash',
      isDanger: true,
      onConfirm: async () => {
        await noteRepo.deleteFolder(folderPath);

        // Remove from persisted folders
        const nextPersisted = new Set<string>();
        for (const p of persistedFolders) {
          if (p !== folderPath && !p.startsWith(folderPath + '/')) {
            nextPersisted.add(p);
          }
        }
        savePersistedFolders(nextPersisted);
      }
    });
  };

  // Move Note to Folder
  const handleOpenMoveNote = (note: Note) => {
    setRenameState({
      isOpen: true,
      title: 'Move to Folder',
      description: 'Enter target folder name (or "root"):',
      initialValue: note.folder || 'root',
      onConfirm: async (targetFolder: string) => {
        const cleanTarget = targetFolder ? targetFolder.trim() : 'root';
        const folderVal = (!cleanTarget || cleanTarget === 'root') ? 'root' : cleanTarget;
        if (folderVal === (note.folder || 'root')) return;

        if (folderVal !== 'root') {
          const nextFolders = new Set(persistedFolders);
          nextFolders.add(folderVal);
          savePersistedFolders(nextFolders);
          setExpandedFolders(prev => {
            const next = new Set(prev);
            next.add(folderVal);
            localStorage.setItem('zoho-expanded-folders', JSON.stringify([...next]));
            return next;
          });
        }

        await noteRepo.updateNote(note.id, { folder: folderVal });
      }
    });
  };

  // Rename Note
  const handleOpenRenameNote = (note: Note) => {
    setRenameState({
      isOpen: true,
      title: 'Rename Notebook',
      description: 'Enter a new title for this notebook:',
      initialValue: note.title,
      onConfirm: async (newTitle: string) => {
        if (!newTitle || newTitle === note.title) return;
        await noteRepo.updateNote(note.id, { title: newTitle });
      }
    });
  };

  // Delete Note
  const handleDeleteNote = (noteId: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Move to Trash?',
      description: 'This notebook will be moved to the trash.',
      confirmText: 'Move to Trash',
      isDanger: true,
      onConfirm: async () => {
        await noteRepo.trashNote(noteId);
        if (activeNotebookId === noteId) {
          setActiveNotebookId(null);
        }
      }
    });
  };

  // Permanent Delete Note
  const handlePermanentDelete = (noteId: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Permanently?',
      description: 'This note will be permanently erased and cannot be recovered.',
      confirmText: 'Delete Forever',
      isDanger: true,
      onConfirm: async () => {
        await noteRepo.deletePermanently(noteId);
      }
    });
  };

  // Empty Entire Trash
  const handleEmptyTrash = () => {
    setConfirmState({
      isOpen: true,
      title: 'Empty Recycle Bin?',
      description: 'All items in trash will be permanently erased.',
      confirmText: 'Empty Trash',
      isDanger: true,
      onConfirm: async () => {
        for (const note of trashedNotes) {
          await noteRepo.deletePermanently(note.id);
        }
      }
    });
  };

  // Render a recursive folder tree node
  const renderFolderNode = (node: FolderNode, level: number = 0) => {
    const isExpanded = expandedFolders.has(node.fullPath) || !!searchQuery.trim();

    return (
      <div key={node.fullPath} className="space-y-0.5">
        {/* Folder Header Row */}
        <div 
          className="group flex items-center justify-between px-2 py-1.5 rounded-lg text-xs hover:bg-dark-800 transition-colors cursor-pointer text-slate-300 hover:text-white select-none"
          style={{ paddingLeft: `${level * 14 + 8}px` }}
          onClick={() => toggleFolder(node.fullPath)}
        >
          <div className="flex items-center gap-1.5 truncate min-w-0 flex-1">
            <span className="text-slate-500 hover:text-slate-300">
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 transition-transform" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 transition-transform" />
              )}
            </span>
            <Folder className="w-3.5 h-3.5 text-[#6d5dfc] shrink-0" />
            <span className="truncate font-medium">{node.name}</span>
          </div>

          {/* Folder Action Buttons (Hover) */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCreateNoteInFolder(node.fullPath);
              }}
              title="Add note in this folder"
              className="p-1 rounded text-slate-400 hover:text-[#6d5dfc] hover:bg-dark-700"
            >
              <PlusSquare className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenRenameFolder(node.fullPath);
              }}
              title="Rename folder"
              className="p-1 rounded text-slate-400 hover:text-amber-400 hover:bg-dark-700"
            >
              <Edit2 className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenDeleteFolder(node.fullPath);
              }}
              title="Delete folder"
              className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-dark-700"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Folder Children (Nested Folders & Notes) */}
        {isExpanded && (
          <div className="space-y-0.5">
            {/* Subfolders */}
            {Object.values(node.subfolders)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(sub => renderFolderNode(sub, level + 1))}

            {/* Notes inside this folder */}
            {node.notes
              .sort((a, b) => a.title.localeCompare(b.title))
              .map(note => renderNoteItem(note, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // Render a note item
  const renderNoteItem = (note: Note, level: number = 0) => {
    const isActive = activeNotebookId === note.id && activeView === 'notebooks';

    return (
      <div
        key={note.id}
        onClick={() => {
          setActiveNotebookId(note.id);
          setActiveView('notebooks');
        }}
        style={{ paddingLeft: `${level * 14 + 16}px` }}
        className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left select-none ${
          isActive
            ? 'bg-[#6d5dfc]/15 text-[#5b4cf0] dark:text-[#818cf8] font-semibold border-l-2 border-[#6d5dfc]'
            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-dark-800 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        <div className="flex items-center gap-2 truncate min-w-0 flex-1">
          <FileCode className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[#5b4cf0] dark:text-[#818cf8]' : 'text-slate-400'}`} />
          <span className="truncate">{note.title || 'Untitled Notebook'}</span>
        </div>

        {/* Note Action Buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={async (e) => {
              e.stopPropagation();
              await noteRepo.updateNote(note.id, { isStarred: !note.isStarred });
            }}
            title={note.isStarred ? 'Unstar' : 'Star'}
            className="p-1 rounded text-slate-400 hover:text-amber-400 hover:bg-dark-700"
          >
            <Star className={`w-3 h-3 ${note.isStarred ? 'text-amber-400 fill-amber-400' : ''}`} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenMoveNote(note);
            }}
            title="Move to folder"
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-dark-700"
          >
            <FolderInput className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenRenameNote(note);
            }}
            title="Rename notebook"
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-dark-700"
          >
            <Edit2 className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteNote(note.id);
            }}
            title="Move to trash"
            className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-dark-700"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  };

  if (!isSidebarOpen) return null;

  return (
    <>
      <aside 
        style={{ width: `${sidebarWidth}px` }}
        className={`relative bg-dark-900 border-r border-dark-600/70 flex flex-col h-full select-none shrink-0 ${
          isResizing ? 'transition-none select-none' : 'transition-[width] duration-150'
        }`}
      >
        {/* Resizable edge handle on right border */}
        <div
          onMouseDown={handleMouseDown}
          onDoubleClick={handleResetWidth}
          className={`absolute top-0 -right-1.5 w-3 h-full cursor-col-resize hover:bg-[#6d5dfc]/40 active:bg-[#6d5dfc] transition-colors z-30 select-none group flex items-center justify-center ${
            isResizing ? 'bg-[#6d5dfc] !w-3' : ''
          }`}
          title="Drag to resize sidebar (Double-click to reset width)"
        >
          <div className={`w-0.5 h-8 rounded-full transition-colors ${
            isResizing ? 'bg-white' : 'bg-slate-500/20 group-hover:bg-white'
          }`} />
        </div>

        {/* Brand Logo Header */}
        <div className="p-3.5 border-b border-dark-600/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <img 
              src="/images/icon-192.png" 
              alt="Zoho Notes Logo" 
              className="w-7 h-7 rounded-lg object-contain shadow-md shadow-[#6d5dfc]/20"
              onError={(e) => {
                // Fallback to div icon if image not available
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div>
              <span className="font-extrabold text-sm text-transparent bg-clip-text bg-gradient-to-r from-[#6d5dfc] to-indigo-600 dark:to-white block leading-tight">
                Zoho Notes
              </span>
              <span className="text-[10px] text-slate-400 font-medium block">
                Polyglot Notebooks
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable Body: Everything below the Brand Header scrolls smoothly */}
        <div className="flex-1 overflow-y-auto flex flex-col justify-between">
          <div>
            {/* Quick Hub Links (Game Changer & Sharing Notes) */}
            <div className="p-2.5 space-y-1.5 border-b border-dark-600/50">
              <button
                onClick={() => handleCreateNoteInFolder('Game Challenges')}
                className="w-full py-1.5 px-3 bg-gradient-to-r from-[#6d5dfc] to-[#9c5dfc] text-white rounded-xl flex items-center justify-center gap-2 text-xs font-bold hover:scale-[1.02] transition-all shadow-md shadow-[#6d5dfc]/30 cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Game Changer</span>
              </button>

              <button
                onClick={() => handleCreateNoteInFolder('Shared Workspaces')}
                className="w-full py-1.5 px-3 border border-[#6d5dfc]/30 bg-[#6d5dfc]/10 text-[#818cf8] rounded-xl flex items-center justify-center gap-2 text-xs font-bold hover:bg-[#6d5dfc]/20 transition-all cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Sharing Notes</span>
              </button>
            </div>

            {/* Clean Single Search Bar */}
            <div className="p-2.5 pb-2">
              <div className="relative group">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#6d5dfc] transition-colors pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search notebooks..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (activeView !== 'notebooks' && e.target.value.trim()) {
                      setActiveView('notebooks');
                    }
                  }}
                  onKeyDown={handleSearchKeyDown}
                  className="w-full bg-dark-800 border border-dark-600/80 rounded-xl pl-9 pr-8 py-1.5 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-[#6d5dfc] focus:ring-1 focus:ring-[#6d5dfc] transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Navigation Sections */}
            <div className="px-2 py-1 space-y-3">
          {/* Main "My Notebooks" Header */}
          <div>
            <div 
              className="flex items-center justify-between p-2 rounded-xl text-slate-300 hover:bg-dark-800 hover:text-white transition-colors cursor-pointer select-none"
              onClick={() => {
                setActiveView('notebooks');
                setIsNotebooksCollapsed(!isNotebooksCollapsed);
              }}
            >
              <div className="flex items-center gap-2 font-semibold text-xs">
                <Layers className="w-4 h-4 text-[#6d5dfc]" />
                <span>My Notebooks</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenCreateFolder('root');
                  }}
                  title="Add Folder"
                  className="p-1 rounded hover:text-[#6d5dfc] hover:bg-dark-700 text-slate-400"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isNotebooksCollapsed ? '-rotate-90' : ''}`} />
              </div>
            </div>

            {/* Folder & Notes Tree */}
            {!isNotebooksCollapsed && (
              <div className="mt-1 space-y-0.5">
                {/* Folders */}
                {Object.values(folderTree.subfolders)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(sub => renderFolderNode(sub, 0))}

                {/* Root Notes */}
                {folderTree.notes
                  .sort((a, b) => a.title.localeCompare(b.title))
                  .map(note => renderNoteItem(note, 0))}

                {/* Empty State when no notes at all */}
                {allNotes.length === 0 && (
                  <div className="px-3 py-4 text-center">
                    <p className="text-xs text-slate-500 mb-2">No notebooks yet</p>
                    <button
                      onClick={() => handleCreateNoteInFolder('root')}
                      className="text-xs text-[#818cf8] hover:underline font-semibold cursor-pointer"
                    >
                      + Create Note
                    </button>
                  </div>
                )}

                {/* Empty Search Result */}
                {searchQuery.trim() && matchingNotes.length === 0 && (
                  <div className="px-3 py-6 text-center">
                    <p className="text-xs text-slate-400 mb-1 font-medium">No notebooks found</p>
                    <p className="text-[11px] text-slate-500 mb-3">No notes match "{searchQuery}"</p>
                    <button
                      onClick={() => setSearchQuery('')}
                      className="text-xs px-2.5 py-1 rounded-lg bg-dark-750 hover:bg-dark-700 text-slate-300 transition-colors cursor-pointer"
                    >
                      Clear Search
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Starred Notes Link */}
          <div
            onClick={() => setActiveView('starred')}
            className={`flex items-center justify-between p-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
              activeView === 'starred'
                ? 'bg-[#6d5dfc]/15 text-[#818cf8]'
                : 'text-slate-300 hover:bg-dark-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span>Starred Notes</span>
            </div>
            {starredNotes.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-dark-750 text-slate-400 font-bold">
                {starredNotes.length}
              </span>
            )}
          </div>

          {/* Starred Notes Expanded View */}
          {activeView === 'starred' && (
            <div className="pl-3 space-y-1">
              {starredNotes.length === 0 ? (
                <p className="text-[11px] text-slate-500 py-1">No starred notes yet.</p>
              ) : (
                starredNotes.map(n => renderNoteItem(n, 0))
              )}
            </div>
          )}

          {/* Trash Link */}
          <div
            onClick={() => setActiveView('trash')}
            className={`flex items-center justify-between p-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
              activeView === 'trash'
                ? 'bg-red-500/15 text-red-400'
                : 'text-slate-300 hover:bg-dark-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-slate-400" />
              <span>Trash</span>
            </div>
            {trashedNotes.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold">
                {trashedNotes.length}
              </span>
            )}
          </div>

          {/* Trash Expanded View */}
          {activeView === 'trash' && (
            <div className="pl-2 space-y-1">
              {trashedNotes.length > 0 && (
                <div className="flex justify-end pr-2 pb-1">
                  <button
                    onClick={handleEmptyTrash}
                    className="text-[10px] text-red-400 hover:underline font-bold"
                  >
                    Empty Trash
                  </button>
                </div>
              )}
              {trashedNotes.length === 0 ? (
                <p className="text-[11px] text-slate-500 py-1">Trash is empty.</p>
              ) : (
                trashedNotes.map(n => (
                  <div
                    key={n.id}
                    className="flex items-center justify-between px-2 py-1.5 rounded-lg text-xs bg-dark-800/60 text-slate-300"
                  >
                    <span className="truncate flex-1 text-[11px]">{n.title}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={async () => await noteRepo.restoreNote(n.id)}
                        title="Restore"
                        className="p-1 text-emerald-400 hover:bg-dark-700 rounded"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(n.id)}
                        title="Delete Forever"
                        className="p-1 text-red-400 hover:bg-dark-700 rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar Footer Section */}
      <div className="p-3 border-t border-dark-600/70 space-y-2 mt-auto">
        {/* User Profile Bar */}
        <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-200/80 dark:bg-dark-800/60 border border-slate-300/80 dark:border-dark-700/60">
          <div className="w-8 h-8 rounded-full bg-[#6d5dfc] text-white flex items-center justify-center font-bold text-xs uppercase shadow-md shadow-[#6d5dfc]/30">
            {user?.username ? user.username.charAt(0) : 'U'}
          </div>
          <div className="flex-1 overflow-hidden">
            <span className="font-semibold text-xs text-slate-800 dark:text-white truncate block">{user?.username || 'User'}</span>
            <button
              onClick={() => logout()}
              className="text-[10px] text-red-600 dark:text-red-400 hover:underline font-semibold block text-left cursor-pointer"
            >
              Logout Account
            </button>
          </div>
        </div>

        {/* Join WhatsApp Community Button */}
        <button
          onClick={() => setIsWhatsAppOpen(true)}
          className="w-full h-9 px-3 bg-[#25d366]/10 hover:bg-[#25d366]/20 border border-[#25d366]/30 text-[#25d366] rounded-xl text-xs font-bold flex items-center justify-start gap-2.5 transition-all cursor-pointer"
        >
          <MessageCircle className="w-4 h-4" />
          <span>Join Community</span>
        </button>

        {/* Settings Button */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="w-full py-1.5 px-3 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-dark-800 text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer"
        >
          <SettingsIcon className="w-4 h-4" />
          <span>Settings</span>
        </button>

        {/* Copyright Credit */}
        <div className="text-[10px] text-slate-500 text-center pt-1">
          <a 
            href="https://fayasktr.github.io/Fayas-protfolio/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:underline hover:text-slate-400"
          >
            © Fayas kp
          </a>
        </div>
      </div>
    </div>
  </aside>

      {/* Modals */}
      <FolderModal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        onConfirm={handleConfirmCreateFolder}
      />

      <RenameModal
        isOpen={renameState.isOpen}
        title={renameState.title}
        description={renameState.description}
        initialValue={renameState.initialValue}
        onClose={() => setRenameState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={renameState.onConfirm}
      />

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        description={confirmState.description}
        confirmText={confirmState.confirmText}
        isDanger={confirmState.isDanger}
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <WhatsAppModal
        isOpen={isWhatsAppOpen}
        onClose={() => setIsWhatsAppOpen(false)}
      />
    </>
  );
};
