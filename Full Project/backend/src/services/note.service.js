const Note = require('../models/Note');
const TrashedCell = require('../models/TrashedCell');

class NoteService {
    /**
     * Get all active notebooks for a user (owned + shared accepted)
     */
    async getUserNotebooks(userId) {
        const ownedNotes = await Note.find({
            owner: userId,
            isTrashed: { $ne: true }
        }).sort({ updatedAt: -1 }).lean();

        const sharedNotes = await Note.find({
            'collaborators.user': userId,
            'collaborators.status': 'accepted',
            isTrashed: { $ne: true }
        }).populate('owner', 'username email').sort({ updatedAt: -1 }).lean();

        const combined = [
            ...ownedNotes.map(n => ({ ...n, isShared: false })),
            ...sharedNotes.map(n => ({ ...n, isShared: true, ownerName: n.owner?.username }))
        ];

        combined.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        return combined;
    }

    /**
     * Get a specific notebook by ID, verifying access permissions
     */
    async getNotebookById(notebookId, userId, isAdmin = false) {
        let query;
        if (isAdmin) {
            query = { id: notebookId };
        } else {
            query = {
                id: notebookId,
                $or: [
                    { owner: userId },
                    { 'collaborators': { $elemMatch: { user: userId, status: 'accepted' } } }
                ]
            };
        }

        const note = await Note.findOne(query).populate('owner', 'username email').lean();
        if (!note) {
            const err = new Error('Notebook not found or access denied');
            err.statusCode = 404;
            throw err;
        }

        return note;
    }

    /**
     * Save / Upsert a notebook
     */
    async saveNotebook(userId, notebookData) {
        if (!notebookData || !notebookData.id) {
            const err = new Error('Notebook ID is required');
            err.statusCode = 400;
            throw err;
        }

        const query = {
            id: notebookData.id,
            $or: [
                { owner: userId },
                { 'collaborators': { $elemMatch: { user: userId, status: 'accepted' } } }
            ]
        };

        const existing = await Note.findOne({ id: notebookData.id });
        if (existing) {
            const isOwner = String(existing.owner) === String(userId);
            const isAcceptedCollab = existing.collaborators?.some(
                c => String(c.user) === String(userId) && c.status === 'accepted'
            );
            if (!isOwner && !isAcceptedCollab) {
                const err = new Error('You do not have write access to this notebook');
                err.statusCode = 403;
                throw err;
            }
        }

        const cells = Array.isArray(notebookData.cells)
            ? notebookData.cells
            : (notebookData.content && Array.isArray(notebookData.content.cells) ? notebookData.content.cells : []);

        const tags = Array.isArray(notebookData.tags)
            ? notebookData.tags
            : (notebookData.content && Array.isArray(notebookData.content.tags) ? notebookData.content.tags : []);

        const currentVersion = existing?._version || 0;
        const nextVersion = Math.max(currentVersion, notebookData._version || 1) + 1;

        const updateDoc = {
            id: notebookData.id,
            title: notebookData.title || 'Untitled Notebook',
            folder: notebookData.folder || 'root',
            isStarred: !!notebookData.isStarred,
            isTrashed: !!notebookData.isTrashed,
            trashedAt: notebookData.trashedAt ? new Date(notebookData.trashedAt) : null,
            _version: nextVersion,
            content: {
                id: notebookData.id,
                title: notebookData.title || 'Untitled Notebook',
                folder: notebookData.folder || 'root',
                isStarred: !!notebookData.isStarred,
                cells,
                tags
            },
            updatedAt: new Date(notebookData.updatedAt || Date.now())
        };

        const note = await Note.findOneAndUpdate(
            query,
            {
                $set: updateDoc,
                $setOnInsert: { owner: userId }
            },
            { upsert: true, new: true, runValidators: true }
        );

        return note;
    }

    /**
     * Rename notebook
     */
    async renameNotebook(userId, notebookId, newTitle) {
        if (!newTitle || !newTitle.trim()) {
            const err = new Error('Title cannot be empty');
            err.statusCode = 400;
            throw err;
        }

        const result = await Note.findOneAndUpdate(
            { id: notebookId, owner: userId },
            { $set: { title: newTitle.trim(), updatedAt: new Date() } },
            { new: true }
        );

        if (!result) {
            const err = new Error('Notebook not found or not owned by you');
            err.statusCode = 404;
            throw err;
        }

        return result;
    }

    /**
     * Star / Unstar notebook
     */
    async toggleStarNotebook(userId, notebookId, isStarred) {
        const note = await Note.findOneAndUpdate(
            { id: notebookId, owner: userId },
            { $set: { isStarred: !!isStarred, updatedAt: new Date() } },
            { new: true }
        );

        if (!note) {
            const err = new Error('Notebook not found');
            err.statusCode = 404;
            throw err;
        }

        return note;
    }

    /**
     * Move notebook to trash
     */
    async trashNotebook(userId, notebookId) {
        const result = await Note.findOneAndUpdate(
            { id: notebookId, owner: userId },
            { $set: { isTrashed: true, trashedAt: new Date(), updatedAt: new Date() } },
            { new: true }
        );

        if (!result) {
            const err = new Error('Notebook not found');
            err.statusCode = 404;
            throw err;
        }

        return result;
    }

    /**
     * Restore notebook from trash
     */
    async restoreNotebook(userId, notebookId) {
        const result = await Note.findOneAndUpdate(
            { id: notebookId, owner: userId },
            { $set: { isTrashed: false, updatedAt: new Date() }, $unset: { trashedAt: '' } },
            { new: true }
        );

        if (!result) {
            const err = new Error('Notebook not found in trash');
            err.statusCode = 404;
            throw err;
        }

        return result;
    }

    /**
     * Permanently delete notebook
     */
    async deleteNotebookPermanently(userId, notebookId) {
        const result = await Note.deleteOne({ id: notebookId, owner: userId });
        if (result.deletedCount === 0) {
            const err = new Error('Notebook not found');
            err.statusCode = 404;
            throw err;
        }
        return { success: true };
    }

    /**
     * Move a single cell between notebooks
     */
    async moveCell(userId, { sourceNotebookId, targetNotebookId, cell }) {
        if (!sourceNotebookId || !targetNotebookId || !cell || !cell.id) {
            const err = new Error('Invalid parameters for moveCell');
            err.statusCode = 400;
            throw err;
        }

        // 1. Remove from source
        await Note.updateOne(
            { id: sourceNotebookId, owner: userId },
            {
                $pull: { 'content.cells': { id: cell.id } },
                $set: { updatedAt: new Date() }
            }
        );

        // 2. Append to target
        await Note.updateOne(
            { id: targetNotebookId, owner: userId },
            {
                $push: { 'content.cells': cell },
                $set: { updatedAt: new Date() }
            }
        );

        return { success: true };
    }

    /**
     * Retrieve all trashed items (notebooks + cells) for a user
     */
    async getUserTrash(userId) {
        const notebooks = await Note.find({
            owner: userId,
            isTrashed: true
        }, 'id title folder updatedAt trashedAt').sort({ trashedAt: -1 }).lean();

        const cells = await TrashedCell.find({
            owner: userId
        }).sort({ deletedAt: -1 }).lean();

        return { notebooks, cells };
    }

    /**
     * Empty entire trash for a user
     */
    async emptyTrash(userId) {
        const noteResult = await Note.deleteMany({ owner: userId, isTrashed: true });
        const cellResult = await TrashedCell.deleteMany({ owner: userId });

        return {
            deletedNotebooks: noteResult.deletedCount,
            deletedCells: cellResult.deletedCount
        };
    }
}

module.exports = new NoteService();
