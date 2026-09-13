const Note = require('../models/Note');
const TrashedCell = require('../models/TrashedCell');

class CellService {
    /**
     * Move an individual cell to trash
     */
    async trashCell(userId, { notebookId, cell }) {
        if (!notebookId || !cell || !cell.id) {
            const err = new Error('Notebook ID and valid Cell are required');
            err.statusCode = 400;
            throw err;
        }

        const notebook = await Note.findOne({ id: notebookId, owner: userId });
        if (!notebook) {
            const err = new Error('Notebook not found or access denied');
            err.statusCode = 404;
            throw err;
        }

        // 1. Create TrashedCell record
        const trashedCell = await TrashedCell.create({
            id: cell.id,
            type: cell.type || 'code',
            title: cell.title || '',
            content: cell.content || '',
            language: cell.language || 'javascript',
            output: cell.output || null,
            isStarred: !!cell.isStarred,
            originalNotebookId: notebookId,
            originalNotebookTitle: notebook.title,
            owner: userId,
            deletedAt: new Date()
        });

        // 2. Remove from active notebook cells
        await Note.updateOne(
            { id: notebookId, owner: userId },
            {
                $pull: { 'content.cells': { id: cell.id } },
                $set: { updatedAt: new Date() }
            }
        );

        return trashedCell;
    }

    /**
     * Restore an individual cell back to its original notebook
     */
    async restoreCell(userId, cellId) {
        const trashedCell = await TrashedCell.findOne({ id: cellId, owner: userId });
        if (!trashedCell) {
            const err = new Error('Trashed cell not found');
            err.statusCode = 404;
            throw err;
        }

        const notebook = await Note.findOne({ id: trashedCell.originalNotebookId, owner: userId });
        if (!notebook) {
            const err = new Error('Original notebook no longer exists');
            err.statusCode = 404;
            throw err;
        }

        // Restore cell back into notebook cells array
        const restoredCellData = {
            id: trashedCell.id,
            type: trashedCell.type,
            title: trashedCell.title,
            content: trashedCell.content,
            language: trashedCell.language,
            output: trashedCell.output,
            isStarred: trashedCell.isStarred
        };

        await Note.updateOne(
            { id: trashedCell.originalNotebookId, owner: userId },
            {
                $push: { 'content.cells': restoredCellData },
                $set: { updatedAt: new Date() }
            }
        );

        // Delete from TrashedCell collection
        await TrashedCell.deleteOne({ id: cellId, owner: userId });

        return {
            restoredCell: restoredCellData,
            notebookId: trashedCell.originalNotebookId
        };
    }

    /**
     * Permanently delete a trashed cell
     */
    async deleteCellPermanently(userId, cellId) {
        const result = await TrashedCell.deleteOne({ id: cellId, owner: userId });
        if (result.deletedCount === 0) {
            const err = new Error('Trashed cell not found');
            err.statusCode = 404;
            throw err;
        }
        return { success: true };
    }
}

module.exports = new CellService();
