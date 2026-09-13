import React, { useState, useEffect } from 'react';
import { 
  FileCode, 
  FileText, 
  Plus, 
  Sparkles,
  BookOpen,
  Copy,
  Check,
  Play,
  Eraser,
  ChevronDown,
  Folder,
  Search,
  X
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/indexedDb';
import { noteRepo } from '../db/noteRepo';
import { useUIStore } from '../store/useUIStore';
import { useAuthStore } from '../store/useAuthStore';
import { useSyncHydration } from '../hooks/useSyncHydration';
import { Button } from '../components/common/Button';
import { Cell } from '../types/note.types';
import { CellList } from '../components/notebook/CellList';
import { cellRunner } from '../services/cellRunner';

export const WorkspacePage: React.FC = () => {
  const { user } = useAuthStore();
  const { activeNotebookId, setActiveNotebookId } = useUIStore();

  // 1. Initialize local-first hydration from Atlas
  const { isHydrating } = useSyncHydration();

  // 2. Query active notebook live from local IndexedDB (< 5ms response)
  const activeNote = useLiveQuery(
    () => (activeNotebookId ? db.notes.get(activeNotebookId) : undefined),
    [activeNotebookId]
  );

  // Auto-select first note if none selected
  const allNotes = useLiveQuery(
    () => db.notes.filter(n => !n.isTrashed).reverse().sortBy('updatedAt'),
    []
  );

  useEffect(() => {
    if (!activeNotebookId && allNotes && allNotes.length > 0) {
      setActiveNotebookId(allNotes[0].id);
    }
  }, [activeNotebookId, allNotes, setActiveNotebookId]);

  const [titleInput, setTitleInput] = useState('');
  const [cellFilterQuery, setCellFilterQuery] = useState('');
  const [isCopiedAll, setIsCopiedAll] = useState(false);
  const [isRunningAll, setIsRunningAll] = useState(false);

  useEffect(() => {
    if (activeNote) {
      setTitleInput(activeNote.title);
    }
  }, [activeNote?.title]);

  const handleTitleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitleInput(newTitle);
    if (activeNote) {
      await noteRepo.updateNote(activeNote.id, { title: newTitle });
    }
  };

  const handleAddCell = async (type: 'code' | 'markdown') => {
    if (!activeNote) return;

    const newCell: Cell = {
      id: `cell-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type,
      language: type === 'code' ? 'javascript' : undefined,
      content: type === 'code' ? '// New code cell\nconsole.log("Ready to execute");' : '### New Documentation Cell\nEnter markdown content here...',
      output: null
    };

    const updatedCells = [...(activeNote.cells || []), newCell];
    await noteRepo.updateNote(activeNote.id, { cells: updatedCells });
  };

  // Copy all cells content to clipboard (Original "copy-all-cells" feature)
  const handleCopyAllCells = async () => {
    if (!activeNote || !activeNote.cells || activeNote.cells.length === 0) return;

    const allContent = activeNote.cells
      .map(c => `// [${c.type.toUpperCase()}${c.language ? ': ' + c.language : ''}]\n${c.content}`)
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(allContent);
      setIsCopiedAll(true);
      setTimeout(() => setIsCopiedAll(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Run all code cells in sequence (Original "run-all-cells" feature)
  const handleRunAllCells = async () => {
    if (!activeNote || !activeNote.cells || isRunningAll) return;
    setIsRunningAll(true);

    try {
      for (const cell of activeNote.cells) {
        if (cell.type === 'code') {
          const output = await cellRunner.runCell(cell);
          const current = await db.notes.get(activeNote.id);
          if (current) {
            const updated = (current.cells || []).map(c => c.id === cell.id ? { ...c, output } : c);
            await noteRepo.updateNote(activeNote.id, { cells: updated });
          }
        }
      }
    } finally {
      setIsRunningAll(false);
    }
  };

  // Clear all outputs across this notebook (Original "clear-all-outputs" feature)
  const handleClearAllOutputs = async () => {
    if (!activeNote || !activeNote.cells) return;
    const updated = activeNote.cells.map(c => ({ ...c, output: null }));
    await noteRepo.updateNote(activeNote.id, { cells: updated });
  };

  // Scroll to bottom (Original "scroll-to-bottom" feature)
  const handleScrollToBottom = () => {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTo({ top: mainEl.scrollHeight, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  };

  const handleCreateFirstNote = async () => {
    if (!user) return;
    const newNote = await noteRepo.createNote({
      title: 'My First Polyglot Notebook',
      folder: 'root',
      cells: [
        {
          id: `cell-${Date.now()}`,
          type: 'markdown',
          content: '## Welcome to Zoho Notes Pro\nYour interactive polyglot notebook. Write markdown notes, run code cells, and organize your ideas seamlessly.'
        },
        {
          id: `cell-${Date.now() + 1}`,
          type: 'code',
          language: 'javascript',
          content: 'const languages = ["JavaScript", "Python", "C++", "Java"];\nconsole.log("Polyglot execution ready:", languages.join(", "));',
          output: {
            stdout: 'Polyglot execution ready: JavaScript, Python, C++, Java'
          }
        }
      ]
    }, user.id);
    setActiveNotebookId(newNote.id);
  };

  if (!activeNote) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4 py-24">
        <div className="w-16 h-16 rounded-2xl bg-dark-800 border border-dark-600 flex items-center justify-center text-accent-light mb-4 shadow-xl">
          <BookOpen className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-1">No Notebook Selected</h2>
        <p className="text-sm text-slate-400 max-w-sm mb-6">
          Create or select a notebook from the sidebar to begin writing and running polyglot code.
        </p>
        <Button onClick={handleCreateFirstNote} icon={<Plus className="w-4 h-4" />}>
          Create Notebook
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6 relative pb-32">
      {/* Notebook Header Bar (Clean, non-repetitive) */}
      <div className="flex flex-col gap-4 pb-4 border-b border-dark-600/70">
        {/* Title & Copy Action */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <input
              type="text"
              value={titleInput}
              onChange={handleTitleChange}
              placeholder="Untitled Notebook"
              className="w-full bg-transparent font-bold text-2xl md:text-3xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-b-2 focus:border-[#6d5dfc] transition-all tracking-tight"
            />
            <button
              onClick={handleCopyAllCells}
              title={isCopiedAll ? "Copied to clipboard!" : "Copy All Notes"}
              className={`p-2 rounded-xl border transition-all shrink-0 cursor-pointer ${
                isCopiedAll
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-dark-800 dark:hover:bg-dark-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border-slate-300 dark:border-dark-600'
              }`}
            >
              {isCopiedAll ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          {/* Notebook Cell Search */}
          <div className="relative group w-48 sm:w-64 shrink-0">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#6d5dfc] transition-colors pointer-events-none" />
            <input
              type="text"
              placeholder="Search cells & labels..."
              value={cellFilterQuery}
              onChange={(e) => setCellFilterQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setCellFilterQuery('');
                } else if (e.key === 'Enter') {
                  const firstMatch = document.querySelector('[data-cell-id]');
                  firstMatch?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
              className="w-full bg-dark-800 border border-dark-600/80 rounded-xl pl-9 pr-8 py-1.5 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-[#6d5dfc] focus:ring-1 focus:ring-[#6d5dfc] transition-all"
            />
            {cellFilterQuery && (
              <button
                onClick={() => setCellFilterQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Notebook Meta Information */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[#818cf8] font-medium bg-[#6d5dfc]/10 px-2 py-0.5 rounded-full border border-[#6d5dfc]/20">
              <Folder className="w-3 h-3" />
              {activeNote.folder && activeNote.folder !== 'root' ? activeNote.folder : 'root'}
            </span>
            <span>{activeNote.cells?.length || 0} cells</span>
          </div>
        </div>
      </div>

      {/* Cloud sync status alert banner */}
      {isHydrating && (
        <div className="p-3 rounded-xl bg-[#6d5dfc]/10 border border-[#6d5dfc]/20 flex items-center justify-between text-xs text-[#818cf8]">
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 animate-spin" />
            Syncing notes from cloud...
          </span>
        </div>
      )}

      {/* Interactive Monaco & Markdown Cell Notebook */}
      <CellList note={activeNote} filterQuery={cellFilterQuery} />

      {/* Floating Action Controls Dock */}
      <div className="fixed bottom-6 right-6 z-30 flex flex-col items-center gap-2 p-1.5 rounded-2xl bg-white/85 dark:bg-dark-850/85 backdrop-blur-md border border-slate-300/80 dark:border-dark-600/70 shadow-2xl">
        {/* Run All */}
        <button
          onClick={handleRunAllCells}
          disabled={isRunningAll}
          title="Run All Code Cells"
          className="w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50"
        >
          <Play className={`w-4 h-4 fill-white ${isRunningAll ? 'animate-spin' : ''}`} />
        </button>

        {/* Clear All Outputs */}
        <button
          onClick={handleClearAllOutputs}
          title="Clear All Outputs"
          className="w-10 h-10 rounded-xl bg-rose-500 hover:bg-rose-600 text-white shadow-md shadow-rose-500/20 flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Eraser className="w-4 h-4" />
        </button>

        <div className="w-6 h-[1px] bg-slate-300 dark:bg-dark-600 my-0.5" />

        {/* Add Code Cell */}
        <button
          onClick={() => handleAddCell('code')}
          title="Add Code Cell"
          className="w-11 h-11 rounded-xl bg-[#6d5dfc] hover:bg-[#5b4cf0] text-white shadow-lg shadow-[#6d5dfc]/30 flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Plus className="w-5 h-5" />
        </button>

        {/* Add Markdown Cell */}
        <button
          onClick={() => handleAddCell('markdown')}
          title="Add Markdown Cell"
          className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-dark-750 dark:hover:bg-dark-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-dark-600 shadow-sm flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          <FileText className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        </button>

        {/* Scroll to Bottom */}
        <button
          onClick={handleScrollToBottom}
          title="Scroll to Bottom"
          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-dark-800 dark:hover:bg-dark-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white border border-slate-200 dark:border-dark-600 shadow-sm flex items-center justify-center transition-all cursor-pointer"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
