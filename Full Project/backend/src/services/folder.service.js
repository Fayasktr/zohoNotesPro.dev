const Note = require('../models/Note');

class FolderService {
    /**
     * Escape string for regular expressions
     */
    _escapeRegex(str) {
        return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }

    /**
     * Rename a folder and all nested paths recursively
     */
    async renameFolder(userId, oldName, newName) {
        if (!oldName || !newName || !oldName.trim() || !newName.trim()) {
            const err = new Error('Both old and new folder names are required');
            err.statusCode = 400;
            throw err;
        }

        const oldEscaped = this._escapeRegex(oldName.trim());
        const newClean = newName.trim();

        // Match exact folder or nested subfolders (e.g., "work" or "work/project1")
        const notes = await Note.find({
            owner: userId,
            folder: { $regex: `^${oldEscaped}(?:/|$)` }
        });

        for (const note of notes) {
            let updatedFolder = note.folder;
            if (note.folder === oldName) {
                updatedFolder = newClean;
            } else if (note.folder.startsWith(`${oldName}/`)) {
                updatedFolder = newClean + note.folder.slice(oldName.length);
            }

            await Note.updateOne(
                { _id: note._id },
                {
                    $set: {
                        folder: updatedFolder,
                        updatedAt: new Date()
                    }
                }
            );
        }

        return { modifiedCount: notes.length };
    }

    /**
     * Delete a folder (moves all contained notes to trash)
     */
    async deleteFolder(userId, folderName) {
        if (!folderName || !folderName.trim()) {
            const err = new Error('Folder name is required');
            err.statusCode = 400;
            throw err;
        }

        const escaped = this._escapeRegex(folderName.trim());
        const result = await Note.updateMany(
            {
                owner: userId,
                folder: { $regex: `^${escaped}(?:/|$)` }
            },
            {
                $set: {
                    isTrashed: true,
                    trashedAt: new Date(),
                    updatedAt: new Date()
                }
            }
        );

        return { trashedCount: result.modifiedCount };
    }

    /**
     * Get distinct folders list for user
     */
    async getUserFolders(userId) {
        const folders = await Note.distinct('folder', {
            owner: userId,
            isTrashed: { $ne: true }
        });
        return folders.filter(f => f && f !== 'root');
    }
}

module.exports = new FolderService();
