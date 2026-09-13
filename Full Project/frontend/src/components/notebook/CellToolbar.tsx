import React from 'react';
import { 
  Play, 
  Trash2, 
  ChevronUp, 
  ChevronDown, 
  Copy, 
  FileCode, 
  FileText,
  Check,
  Eye,
  Edit3,
  Star
} from 'lucide-react';
import { Cell, SupportedLanguage } from '../../types/note.types';

interface CellToolbarProps {
  cell: Cell;
  index: number;
  totalCells: number;
  isRunning?: boolean;
  isEditingMarkdown?: boolean;
  onRun?: () => void;
  onChangeTitle?: (title: string) => void;
  onChangeLanguage?: (lang: SupportedLanguage) => void;
  onToggleStar?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onToggleMarkdownMode?: () => void;
}

const LANGUAGES: { id: SupportedLanguage; label: string }[] = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'java', label: 'Java' }
];

export const CellToolbar: React.FC<CellToolbarProps> = ({
  cell,
  index,
  totalCells,
  isRunning = false,
  isEditingMarkdown = false,
  onRun,
  onChangeTitle,
  onChangeLanguage,
  onToggleStar,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  onToggleMarkdownMode
}) => {
  return (
    <div className="px-3 py-1.5 bg-dark-800 border-b border-dark-700 flex items-center justify-between gap-2 text-xs select-none">
      {/* Left side: Cell index & reordering */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="font-mono text-[11px] text-slate-500 font-semibold min-w-[24px]">
          [{index + 1}]
        </span>

        {/* Move up */}
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          className="p-1 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/80 dark:hover:bg-dark-700 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
          title="Move Cell Up"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>

        {/* Move down */}
        <button
          onClick={onMoveDown}
          disabled={index === totalCells - 1}
          className="p-1 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/80 dark:hover:bg-dark-700 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
          title="Move Cell Down"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Middle: Cell Heading / Label Input (Original cell-title-input) */}
      <div className="flex-1 min-w-[120px] max-w-xl mx-1">
        <input
          type="text"
          value={cell.title || ''}
          onChange={(e) => onChangeTitle?.(e.target.value)}
          placeholder="Set note label / heading..."
          className="w-full bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-dark-600 focus:border-[#6d5dfc] text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none transition-colors px-1.5 py-0.5"
        />
      </div>

      {/* Right side: Type/Language selector & Action buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {cell.type === 'code' ? (
          <div className="flex items-center gap-1.5 mr-1">
            <FileCode className="w-3.5 h-3.5 text-accent-light" />
            <select
              value={cell.language || 'javascript'}
              onChange={(e) => onChangeLanguage?.(e.target.value as SupportedLanguage)}
              className="bg-slate-100 dark:bg-dark-900 border border-slate-300 dark:border-dark-600 rounded px-2 py-0.5 text-xs text-slate-700 dark:text-slate-200 font-mono focus:outline-none focus:border-accent-light cursor-pointer"
            >
              {LANGUAGES.map(lang => (
                <option key={lang.id} value={lang.id}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 uppercase mr-1">
            <FileText className="w-3 h-3 text-indigo-400" />
            <span>Markdown</span>
          </div>
        )}

        {/* Star Button */}
        {onToggleStar && (
          <button
            onClick={onToggleStar}
            className={`p-1 rounded transition-colors cursor-pointer ${
              cell.isStarred ? 'text-amber-400' : 'text-slate-400 hover:text-amber-400 hover:bg-slate-200/80 dark:hover:bg-dark-700'
            }`}
            title={cell.isStarred ? 'Starred Cell' : 'Star Cell'}
          >
            <Star className={`w-3.5 h-3.5 ${cell.isStarred ? 'fill-amber-400' : ''}`} />
          </button>
        )}

        {/* Markdown preview toggle */}
        {cell.type === 'markdown' && onToggleMarkdownMode && (
          <button
            onClick={onToggleMarkdownMode}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-200 dark:bg-dark-700 hover:bg-slate-300 dark:hover:bg-dark-600 text-slate-700 dark:text-slate-300 text-xs transition-colors cursor-pointer mr-0.5"
            title={isEditingMarkdown ? 'Switch to rendered preview' : 'Switch to markdown editor'}
          >
            {isEditingMarkdown ? (
              <>
                <Eye className="w-3 h-3 text-accent-light" />
                <span>Preview</span>
              </>
            ) : (
              <>
                <Edit3 className="w-3 h-3 text-amber-400" />
                <span>Edit</span>
              </>
            )}
          </button>
        )}

        {/* Code Run button */}
        {cell.type === 'code' && onRun && (
          <button
            onClick={onRun}
            disabled={isRunning}
            className={`flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold transition-all cursor-pointer mr-0.5 ${
              isRunning
                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                : 'bg-emerald-500/15 hover:bg-emerald-500/25 dark:bg-emerald-600/20 dark:hover:bg-emerald-600/30 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 dark:border-emerald-500/30'
            }`}
            title="Execute Code (Ctrl + Enter)"
          >
            <Play className={`w-3 h-3 ${isRunning ? 'animate-spin' : 'fill-emerald-600 dark:fill-emerald-400 text-emerald-600 dark:text-emerald-400'}`} />
            <span>{isRunning ? 'Running...' : 'Run'}</span>
          </button>
        )}

        {/* Duplicate */}
        <button
          onClick={onDuplicate}
          className="p-1 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/80 dark:hover:bg-dark-700 cursor-pointer"
          title="Duplicate Cell"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>

        {/* Delete */}
        <button
          onClick={onDelete}
          className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-500/10 cursor-pointer ml-0.5"
          title="Delete Cell"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
