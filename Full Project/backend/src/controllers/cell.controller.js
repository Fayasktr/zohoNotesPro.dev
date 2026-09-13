const cellService = require('../services/cell.service');
const ResponseView = require('../views/response.view');
const NoteView = require('../views/note.view');

class CellController {
    /**
     * POST /api/cells/trash
     */
    async trashCell(req, res, next) {
        try {
            const trashedCell = await cellService.trashCell(req.user.id, req.body);
            return ResponseView.success(res, NoteView.formatTrashedCell(trashedCell), 'Cell moved to trash');
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/trash/restore-cell/:id
     */
    async restoreCell(req, res, next) {
        try {
            const result = await cellService.restoreCell(req.user.id, req.params.id);
            return ResponseView.success(res, result, 'Cell restored successfully');
        } catch (err) {
            next(err);
        }
    }

    /**
     * DELETE /api/trash/cell/:id
     */
    async deleteCellPermanently(req, res, next) {
        try {
            await cellService.deleteCellPermanently(req.user.id, req.params.id);
            return ResponseView.success(res, null, 'Cell permanently deleted');
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new CellController();
