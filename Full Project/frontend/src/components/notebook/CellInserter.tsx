import React from 'react';
import { Plus, FileCode, FileText } from 'lucide-react';
import { CellType } from '../../types/note.types';

interface CellInserterProps {
  onInsert: (type: CellType) => void;
}

export const CellInserter: React.FC<CellInserterProps> = ({ onInsert }) => {
  return (
    <div className="relative py-2 group">
      {/* Subtle hairline that lights up on hover */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-full border-t border-transparent group-hover:border-dark-600 transition-colors" />
      </div>

      {/* Floating pill with buttons on hover */}
      <div className="relative flex justify-center opacity-0 group-hover:opacity-100 transition-all transform scale-95 group-hover:scale-100">
        <div className="flex items-center gap-1.5 bg-white dark:bg-dark-800 border border-slate-300 dark:border-dark-600 px-2.5 py-1 rounded-full shadow-lg">
          <button
            onClick={() => onInsert('code')}
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-[#6d5dfc] dark:text-slate-300 dark:hover:text-accent-light px-2 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3 text-accent-light" />
            <FileCode className="w-3 h-3 text-slate-400" />
            <span>Code</span>
          </button>
          <span className="w-px h-3 bg-slate-300 dark:bg-dark-600" />
          <button
            onClick={() => onInsert('markdown')}
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-indigo-500 dark:text-slate-300 dark:hover:text-indigo-400 px-2 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3 text-indigo-400" />
            <FileText className="w-3 h-3 text-slate-400" />
            <span>Markdown</span>
          </button>
        </div>
      </div>
    </div>
  );
};
