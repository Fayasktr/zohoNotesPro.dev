/**
 * Note View Presenter
 * Formats note and cell documents for client hydration and synchronization.
 */

class NoteView {
    /**
     * Formats a single note into standard client DTO
     */
    static formatNote(note, currentUserId = null) {
        if (!note) return null;

        const cells = Array.isArray(note.content?.cells)
            ? note.content.cells
            : (Array.isArray(note.cells) ? note.cells : []);

        const tags = Array.isArray(note.content?.tags)
            ? note.content.tags
            : (Array.isArray(note.tags) ? note.tags : []);

        const isOwner = currentUserId ? String(note.owner?._id || note.owner) === String(currentUserId) : true;
        const ownerName = note.owner?.username || note.ownerName || 'Unknown';

        return {
            id: note.id,
            title: note.title || 'Untitled Notebook',
            folder: note.folder || 'root',
            isStarred: !!note.isStarred,
            isTrashed: !!note.isTrashed,
            trashedAt: note.trashedAt ? new Date(note.trashedAt).getTime() : null,
            cells,
            tags,
            _version: typeof note._version === 'number' ? note._version : 1,
            updatedAt: note.updatedAt ? new Date(note.updatedAt).getTime() : Date.now(),
            owner: String(note.owner?._id || note.owner),
            ownerName,
            isShared: !isOwner,
            collaborators: Array.isArray(note.collaborators) ? note.collaborators : []
        };
    }

    /**
     * Formats list of notes
     */
    static formatNoteList(notes, currentUserId = null) {
        return (notes || []).map(n => this.formatNote(n, currentUserId));
    }

    /**
     * Formats a lightweight note manifest item for sync diffing
     */
    static formatManifestItem(note) {
        return {
            id: note.id,
            title: note.title || 'Untitled Notebook',
            folder: note.folder || 'root',
            isStarred: !!note.isStarred,
            isTrashed: !!note.isTrashed,
            trashedAt: note.trashedAt ? new Date(note.trashedAt).getTime() : null,
            updatedAt: note.updatedAt ? new Date(note.updatedAt).getTime() : Date.now(),
            _version: typeof note._version === 'number' ? note._version : 1,
            owner: String(note.owner?._id || note.owner)
        };
    }

    /**
     * Formats list of note manifest items
     */
    static formatManifestList(notes) {
        return (notes || []).map(n => this.formatManifestItem(n));
    }

    /**
     * Formats a trashed cell item
     */
    static formatTrashedCell(cell) {
        return {
            id: cell.id,
            type: cell.type,
            title: cell.title,
            content: cell.content,
            language: cell.language,
            output: cell.output,
            isStarred: cell.isStarred,
            originalNotebookId: cell.originalNotebookId,
            originalNotebookTitle: cell.originalNotebookTitle,
            deletedAt: cell.deletedAt ? new Date(cell.deletedAt).getTime() : Date.now()
        };
    }

    /**
     * Formats list of trashed cells
     */
    static formatTrashedCellList(cells) {
        return (cells || []).map(c => this.formatTrashedCell(c));
    }
}

module.exports = NoteView;
