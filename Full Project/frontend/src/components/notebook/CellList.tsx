import React, { useState } from 'react';
import { Note, Cell, CellType, SupportedLanguage } from '../../types/note.types';
import { CodeCell } from './CodeCell';
import { MarkdownCell } from './MarkdownCell';
import { CellInserter } from './CellInserter';
import { noteRepo } from '../../db/noteRepo';
import { cellRunner } from '../../services/cellRunner';
import { Plus, FileCode, FileText, Tag } from 'lucide-react';
import { Button } from '../common/Button';
import { ConfirmModal } from '../modals/ConfirmModal';

interface CellListProps {
  note: Note;
  filterQuery?: string;
}

export const CellList: React.FC<CellListProps> = ({ note, filterQuery = '' }) => {
  const [runningCellIds, setRunningCellIds] = useState<Record<string, boolean>>({});
  const [cellToDelete, setCellToDelete] = useState<{ id: string; index: number; type: CellType } | null>(null);

  const cells = note.cells || [];
  const normalizedQuery = filterQuery.toLowerCase().trim();

  // Filter cells if search query is provided
  const visibleCells = normalizedQuery
    ? cells.filter(c => (c.title || '').toLowerCase().includes(normalizedQuery) || c.content.toLowerCase().includes(normalizedQuery))
    : cells;

  // Update cell fields helper
  const updateCells = async (newCells: Cell[]) => {
    await noteRepo.updateNote(note.id, { cells: newCells });
  };

  const handleContentChange = async (cellId: string, content: string) => {
    const updated = cells.map(c => c.id === cellId ? { ...c, content } : c);
    await updateCells(updated);
  };

  const handleTitleChange = async (cellId: string, title: string) => {
    const updated = cells.map(c => c.id === cellId ? { ...c, title } : c);
    await updateCells(updated);
  };

  const handleToggleStar = async (cellId: string) => {
    const updated = cells.map(c => c.id === cellId ? { ...c, isStarred: !c.isStarred } : c);
    await updateCells(updated);
  };

  const handleLanguageChange = async (cellId: string, language: SupportedLanguage) => {
    const updated = cells.map(c => c.id === cellId ? { ...c, language } : c);
    await updateCells(updated);
  };

  const handleRunCell = async (cell: Cell) => {
    setRunningCellIds(prev => ({ ...prev, [cell.id]: true }));
    try {
      const output = await cellRunner.runCell(cell);
      const updated = cells.map(c => c.id === cell.id ? { ...c, output } : c);
      await updateCells(updated);
    } finally {
      setRunningCellIds(prev => ({ ...prev, [cell.id]: false }));
    }
  };

  const handleClearOutput = async (cellId: string) => {
    const updated = cells.map(c => c.id === cellId ? { ...c, output: null } : c);
    await updateCells(updated);
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const newCells = [...cells];
    const temp = newCells[index];
    newCells[index] = newCells[index - 1];
    newCells[index - 1] = temp;
    await updateCells(newCells);
  };

  const handleMoveDown = async (index: number) => {
    if (index === cells.length - 1) return;
    const newCells = [...cells];
    const temp = newCells[index];
    newCells[index] = newCells[index + 1];
    newCells[index + 1] = temp;
    await updateCells(newCells);
  };

  const handleDuplicate = async (index: number) => {
    const target = cells[index];
    const duplicate: Cell = {
      ...target,
      id: `cell-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      output: null
    };
    const newCells = [...cells];
    newCells.splice(index + 1, 0, duplicate);
    await updateCells(newCells);
  };

  const handleDeleteRequest = (cell: Cell, index: number) => {
    setCellToDelete({ id: cell.id, index: index + 1, type: cell.type });
  };

  const handleConfirmDelete = async () => {
    if (!cellToDelete) return;
    const newCells = cells.filter(c => c.id !== cellToDelete.id);
    await updateCells(newCells);
    setCellToDelete(null);
  };

  const handleInsertAt = async (index: number, type: CellType) => {
    const newCell: Cell = {
      id: `cell-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type,
      language: type === 'code' ? 'javascript' : undefined,
      content: type === 'code' ? '// New code cell\nconsole.log("Hello from cell!");' : '### Documentation\nEnter markdown content here...',
      output: null
    };
    const newCells = [...cells];
    newCells.splice(index, 0, newCell);
    await updateCells(newCells);
  };

  if (cells.length === 0) {
    return (
      <div className="text-center py-16 px-4 bg-dark-850/60 rounded-2xl border border-dashed border-dark-600">
        <p className="text-sm text-slate-400 mb-4">This notebook has no cells yet.</p>
        <div className="flex justify-center gap-3">
          <Button
            size="sm"
            onClick={() => handleInsertAt(0, 'code')}
            icon={<FileCode className="w-4 h-4 text-accent-light" />}
          >
            Add Code Cell
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleInsertAt(0, 'markdown')}
            icon={<FileText className="w-4 h-4 text-slate-400" />}
          >
            Add Markdown Cell
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1 pb-24">
      {/* Top Inserter */}
      <CellInserter onInsert={(type) => handleInsertAt(0, type)} />

      {/* Matching Cell List */}
      {visibleCells.map((cell) => {
        const realIndex = cells.findIndex(c => c.id === cell.id);
        const effectiveIndex = realIndex >= 0 ? realIndex : 0;

        return (
          <React.Fragment key={cell.id}>
            <div data-cell-id={cell.id}>
              {cell.type === 'code' ? (
                <CodeCell
                  cell={cell}
                  index={effectiveIndex}
                  totalCells={cells.length}
                  isRunning={!!runningCellIds[cell.id]}
                  onChangeContent={(val) => handleContentChange(cell.id, val)}
                  onChangeTitle={(title) => handleTitleChange(cell.id, title)}
                  onChangeLanguage={(lang) => handleLanguageChange(cell.id, lang)}
                  onToggleStar={() => handleToggleStar(cell.id)}
                  onRun={() => handleRunCell(cell)}
                  onMoveUp={() => handleMoveUp(effectiveIndex)}
                  onMoveDown={() => handleMoveDown(effectiveIndex)}
                  onDuplicate={() => handleDuplicate(effectiveIndex)}
                  onDelete={() => handleDeleteRequest(cell, effectiveIndex)}
                  onClearOutput={() => handleClearOutput(cell.id)}
                />
              ) : (
                <MarkdownCell
                  cell={cell}
                  index={effectiveIndex}
                  totalCells={cells.length}
                  onChangeContent={(val) => handleContentChange(cell.id, val)}
                  onChangeTitle={(title) => handleTitleChange(cell.id, title)}
                  onToggleStar={() => handleToggleStar(cell.id)}
                  onMoveUp={() => handleMoveUp(effectiveIndex)}
                  onMoveDown={() => handleMoveDown(effectiveIndex)}
                  onDuplicate={() => handleDuplicate(effectiveIndex)}
                  onDelete={() => handleDeleteRequest(cell, effectiveIndex)}
                />
              )}
            </div>

            {/* Inserter after every cell */}
            <CellInserter onInsert={(type) => handleInsertAt(effectiveIndex + 1, type)} />
          </React.Fragment>
        );
      })}

      {/* Empty State when no cells match filter query */}
      {cells.length > 0 && visibleCells.length === 0 && (
        <div className="text-center py-12 px-4 bg-dark-850/60 rounded-2xl border border-dashed border-dark-600/80">
          <Tag className="w-8 h-8 text-emerald-400/60 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-300 mb-1">No cells match "{filterQuery}"</p>
          <p className="text-xs text-slate-500">Try filtering by other tags, labels, keywords, or code snippets.</p>
        </div>
      )}

      {/* Bottom quick actions */}
      <div className="pt-4 flex justify-center gap-3">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => handleInsertAt(cells.length, 'code')}
          icon={<Plus className="w-3.5 h-3.5 text-accent-light" />}
        >
          Add Code Cell
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => handleInsertAt(cells.length, 'markdown')}
          icon={<Plus className="w-3.5 h-3.5 text-indigo-400" />}
        >
          Add Markdown Cell
        </Button>
      </div>

      {/* Confirmation Modal for Cell Deletion */}
      <ConfirmModal
        isOpen={!!cellToDelete}
        title={`Delete ${cellToDelete?.type === 'code' ? 'Code' : 'Markdown'} Cell [${cellToDelete?.index}]?`}
        description="Are you sure you want to remove this cell from your notebook? This action cannot be undone."
        confirmText="Delete Cell"
        isDanger={true}
        onClose={() => setCellToDelete(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};
