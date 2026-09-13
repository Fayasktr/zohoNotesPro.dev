const syncService = require('../services/sync.service');
const ResponseView = require('../views/response.view');
const NoteView = require('../views/note.view');

class SyncController {
    /**
     * GET /api/sync/hydrate
     * Returns full hydration dataset for 100% offline availability in client Dexie DB
     */
    async hydrate(req, res, next) {
        try {
            const { serverTime, count, notes } = await syncService.hydrate(req.user.id);
            return ResponseView.success(res, {
                serverTime,
                count,
                notes: NoteView.formatNoteList(notes, req.user.id)
            }, 'Hydration successful');
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /api/sync/manifest
     * Lightweight note manifest for fast client diffing
     */
    async manifest(req, res, next) {
        try {
            const manifest = await syncService.getManifest(req.user.id);
            return ResponseView.success(res, NoteView.formatManifestList(manifest));
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/sync/pull
     * Pulls full note content on-demand for specific note IDs
     */
    async pull(req, res, next) {
        try {
            const { noteIds } = req.body;
            const notes = await syncService.pullNotes(req.user.id, noteIds);
            return ResponseView.success(res, {
                notes: NoteView.formatNoteList(notes, req.user.id)
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/sync/push (and POST /api/backup/push)
     * Receives batch updates from local browser and creates/updates backups in MongoDB Atlas
     */
    async push(req, res, next) {
        try {
            const { batch } = req.body;
            const result = await syncService.pushBatch(req.user.id, batch);
            return ResponseView.success(res, result, 'Backup batch processed');
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /api/sync/status
     * Telemetry diagnostics
     */
    async status(req, res, next) {
        try {
            const telemetry = await syncService.getStatus(req.user.id);
            return ResponseView.success(res, telemetry);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new SyncController();
