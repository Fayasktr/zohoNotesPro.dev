import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { marked } from 'marked';
import { Cell } from '../../types/note.types';
import { useUIStore } from '../../store/useUIStore';
import { CellToolbar } from './CellToolbar';

interface MarkdownCellProps {
  cell: Cell;
  index: number;
  totalCells: number;
  onChangeContent: (content: string) => void;
  onChangeTitle?: (title: string) => void;
  onToggleStar?: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export const MarkdownCell: React.FC<MarkdownCellProps> = ({
  cell,
  index,
  totalCells,
  onChangeContent,
  onChangeTitle,
  onToggleStar,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete
}) => {
  const { theme } = useUIStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editorHeight, setEditorHeight] = useState(() => {
    const lineCount = (cell.content || '').split('\n').length;
    return Math.max(70, lineCount * 20 + 20);
  });

  // Render markdown to safe HTML
  const renderedHtml = React.useMemo(() => {
    try {
      return marked.parse(cell.content || '*Empty markdown cell. Click edit to add text.*');
    } catch {
      return '<p class="text-red-400">Failed to render markdown</p>';
    }
  }, [cell.content]);

  return (
    <div className="rounded-xl bg-dark-850 border border-dark-600/70 overflow-hidden shadow-lg transition-all hover:border-dark-500">
      {/* Cell Header Toolbar */}
      <CellToolbar
        cell={cell}
        index={index}
        totalCells={totalCells}
        isEditingMarkdown={isEditing}
        onChangeTitle={onChangeTitle}
        onToggleStar={onToggleStar}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onToggleMarkdownMode={() => setIsEditing(!isEditing)}
      />

      {/* Body: Either Editor or Rendered Preview */}
      {isEditing ? (
        <div className="py-2 bg-dark-900/90 relative">
          <Editor
            height={`${editorHeight}px`}
            language="markdown"
            value={cell.content}
            theme={theme === 'light' ? 'vs' : 'vs-dark'}
            onChange={(val) => onChangeContent(val || '')}
            options={{
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              fontFamily: '"JetBrains Mono", monospace',
              lineNumbers: 'off',
              wordWrap: 'on',
              wrappingStrategy: 'advanced',
              automaticLayout: true,
              tabSize: 2,
              scrollbar: {
                vertical: 'hidden',
                horizontal: 'hidden',
                handleMouseWheel: false,
                alwaysConsumeMouseWheel: false
              },
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true
            }}
            onMount={(editor) => {
              const updateHeight = () => {
                const contentHeight = editor.getContentHeight();
                setEditorHeight(Math.max(70, contentHeight));
              };
              updateHeight();
              editor.onDidContentSizeChange(updateHeight);
            }}
          />
          <div className="px-3 py-1 bg-dark-800/80 border-t border-dark-700/60 flex justify-end">
            <button
              onClick={() => setIsEditing(false)}
              className="text-xs px-2.5 py-1 rounded bg-accent-primary hover:bg-accent-hover text-white font-medium transition-colors cursor-pointer"
            >
              Done Editing
            </button>
          </div>
        </div>
      ) : (
        <div
          onDoubleClick={() => setIsEditing(true)}
          className="p-5 text-sm text-slate-200 leading-relaxed cursor-text min-h-[50px] bg-dark-900/40 select-text prose prose-invert max-w-none [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-white [&_h1]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-white [&_h3]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2.5 [&_code]:bg-dark-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-accent-light [&_pre]:bg-dark-900 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-500 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-slate-400"
          dangerouslySetInnerHTML={{ __html: renderedHtml as string }}
          title="Double click to edit markdown"
        />
      )}
    </div>
  );
};
