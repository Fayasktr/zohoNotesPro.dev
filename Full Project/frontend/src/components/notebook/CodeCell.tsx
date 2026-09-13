import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Cell, SupportedLanguage } from '../../types/note.types';
import { useUIStore } from '../../store/useUIStore';
import { CellToolbar } from './CellToolbar';
import { X, Clock, Terminal as TerminalIcon } from 'lucide-react';

interface CodeCellProps {
  cell: Cell;
  index: number;
  totalCells: number;
  isRunning?: boolean;
  onChangeContent: (content: string) => void;
  onChangeTitle?: (title: string) => void;
  onChangeLanguage?: (lang: SupportedLanguage) => void;
  onToggleStar?: () => void;
  onRun: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClearOutput: () => void;
}

// Map internal language IDs to Monaco Editor language identifiers
const MONACO_LANG_MAP: Record<SupportedLanguage, string> = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  c: 'c',
  cpp: 'cpp',
  java: 'java'
};

export const CodeCell: React.FC<CodeCellProps> = ({
  cell,
  index,
  totalCells,
  isRunning = false,
  onChangeContent,
  onChangeTitle,
  onChangeLanguage,
  onToggleStar,
  onRun,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  onClearOutput
}) => {
  // Compute dynamic height that auto-resizes to fit content without vertical scroll
  const [editorHeight, setEditorHeight] = useState(() => {
    const lineCount = (cell.content || '').split('\n').length;
    return Math.max(80, lineCount * 20 + 20);
  });

  const { theme } = useUIStore();

  const handleEditorChange = (value: string | undefined) => {
    onChangeContent(value || '');
  };

  return (
    <div className="rounded-xl bg-dark-850 border border-dark-600/70 overflow-hidden shadow-lg transition-all hover:border-dark-500 focus-within:border-accent-primary/60">
      {/* Cell Header Toolbar */}
      <CellToolbar
        cell={cell}
        index={index}
        totalCells={totalCells}
        isRunning={isRunning}
        onRun={onRun}
        onChangeTitle={onChangeTitle}
        onChangeLanguage={onChangeLanguage}
        onToggleStar={onToggleStar}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />

      {/* Monaco Code Editor Canvas */}
      <div className="py-2 bg-dark-900/90 relative">
        <Editor
          height={`${editorHeight}px`}
          language={MONACO_LANG_MAP[cell.language || 'javascript']}
          value={cell.content}
          theme={theme === 'light' ? 'vs' : 'vs-dark'}
          onChange={handleEditorChange}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            lineNumbers: 'on',
            lineNumbersMinChars: 3,
            renderLineHighlight: 'all',
            tabSize: 2,
            wordWrap: 'on',
            automaticLayout: true,
            scrollbar: {
              vertical: 'hidden',
              horizontal: 'hidden',
              handleMouseWheel: false,
              alwaysConsumeMouseWheel: false
            },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true
          }}
          onMount={(editor, monaco) => {
            const updateHeight = () => {
              const contentHeight = editor.getContentHeight();
              setEditorHeight(Math.max(80, contentHeight));
            };
            updateHeight();
            editor.onDidContentSizeChange(updateHeight);

            // Keybinding: Ctrl+Enter (or Cmd+Enter) to run cell
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
              onRun();
            });
          }}
        />
      </div>

      {/* Terminal Output Tray */}
      {cell.output && (
        <div className="border-t border-dark-700 bg-black/60 p-3 text-xs font-mono relative">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-dark-700/60 text-slate-500 text-[11px]">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-400">
              <TerminalIcon className="w-3.5 h-3.5 text-accent-light" /> Output
            </span>
            <div className="flex items-center gap-2">
              {cell.output.executionTimeMs !== undefined && (
                <span className="flex items-center gap-1 text-slate-400">
                  <Clock className="w-3 h-3" /> {cell.output.executionTimeMs}ms
                </span>
              )}
              <button
                onClick={onClearOutput}
                className="text-slate-500 hover:text-slate-300 p-0.5 rounded cursor-pointer"
                title="Clear Output"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Standard output in Emerald */}
          {cell.output.stdout && (
            <pre className="text-emerald-400 whitespace-pre-wrap leading-relaxed font-mono">
              {cell.output.stdout}
            </pre>
          )}

          {/* Standard error or compilation error in Red */}
          {cell.output.stderr && (
            <pre className="text-red-400 whitespace-pre-wrap leading-relaxed font-mono">
              {cell.output.stderr}
            </pre>
          )}

          {cell.output.error && (
            <pre className="text-red-400 whitespace-pre-wrap leading-relaxed font-mono">
              {cell.output.error}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
