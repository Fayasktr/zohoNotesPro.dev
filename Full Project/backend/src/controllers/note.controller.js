const noteService = require('../services/note.service');
const ResponseView = require('../views/response.view');
const NoteView = require('../views/note.view');

class NoteController {
    /**
     * GET /api/notebooks
     */
    async listNotes(req, res, next) {
        try {
            const notes = await noteService.getUserNotebooks(req.user.id);
            return ResponseView.success(res, NoteView.formatNoteList(notes, req.user.id));
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /api/notebooks/:id
     */
    async getNote(req, res, next) {
        try {
            const isAdmin = req.user.role === 'admin';
            const note = await noteService.getNotebookById(req.params.id, req.user.id, isAdmin);
            return ResponseView.success(res, NoteView.formatNote(note, req.user.id));
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/notebooks
     */
    async saveNote(req, res, next) {
        try {
            const note = await noteService.saveNotebook(req.user.id, req.body);
            return ResponseView.success(res, NoteView.formatNote(note, req.user.id), 'Notebook saved');
        } catch (err) {
            next(err);
        }
    }

    /**
     * PUT /api/notebooks/:id/rename
     */
    async renameNote(req, res, next) {
        try {
            const { title } = req.body;
            const updated = await noteService.renameNotebook(req.user.id, req.params.id, title);
            return ResponseView.success(res, NoteView.formatNote(updated, req.user.id), 'Notebook renamed');
        } catch (err) {
            next(err);
        }
    }

    /**
     * PUT /api/notebooks/:id/star
     */
    async toggleStar(req, res, next) {
        try {
            const { isStarred } = req.body;
            const updated = await noteService.toggleStarNotebook(req.user.id, req.params.id, isStarred);
            return ResponseView.success(res, NoteView.formatNote(updated, req.user.id), 'Star status updated');
        } catch (err) {
            next(err);
        }
    }

    /**
     * DELETE /api/notebooks/:id (move to trash)
     */
    async trashNote(req, res, next) {
        try {
            const updated = await noteService.trashNotebook(req.user.id, req.params.id);
            return ResponseView.success(res, NoteView.formatNote(updated, req.user.id), 'Notebook moved to trash');
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/trash/restore/:id
     */
    async restoreNote(req, res, next) {
        try {
            const updated = await noteService.restoreNotebook(req.user.id, req.params.id);
            return ResponseView.success(res, NoteView.formatNote(updated, req.user.id), 'Notebook restored from trash');
        } catch (err) {
            next(err);
        }
    }

    /**
     * DELETE /api/trash/:id (permanent delete)
     */
    async deletePermanently(req, res, next) {
        try {
            await noteService.deleteNotebookPermanently(req.user.id, req.params.id);
            return ResponseView.success(res, null, 'Notebook permanently deleted');
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/notebooks/move-cell
     */
    async moveCell(req, res, next) {
        try {
            const result = await noteService.moveCell(req.user.id, req.body);
            return ResponseView.success(res, result, 'Cell moved successfully');
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /api/trash
     */
    async getTrash(req, res, next) {
        try {
            const { notebooks, cells } = await noteService.getUserTrash(req.user.id);
            return ResponseView.success(res, {
                notebooks: NoteView.formatNoteList(notebooks, req.user.id),
                cells: NoteView.formatTrashedCellList(cells)
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * DELETE /api/trash/empty-all
     */
    async emptyTrash(req, res, next) {
        try {
            const result = await noteService.emptyTrash(req.user.id);
            return ResponseView.success(res, result, 'Trash emptied successfully');
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new NoteController();
