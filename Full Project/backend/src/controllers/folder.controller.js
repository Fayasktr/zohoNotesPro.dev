const folderService = require('../services/folder.service');
const ResponseView = require('../views/response.view');

class FolderController {
    /**
     * GET /api/folders
     */
    async listFolders(req, res, next) {
        try {
            const folders = await folderService.getUserFolders(req.user.id);
            return ResponseView.success(res, folders);
        } catch (err) {
            next(err);
        }
    }

    /**
     * PUT /api/folders/rename
     */
    async renameFolder(req, res, next) {
        try {
            const { oldName, newName } = req.body;
            const result = await folderService.renameFolder(req.user.id, oldName, newName);
            return ResponseView.success(res, result, 'Folder renamed successfully');
        } catch (err) {
            next(err);
        }
    }

    /**
     * DELETE /api/folders/:name
     */
    async deleteFolder(req, res, next) {
        try {
            const result = await folderService.deleteFolder(req.user.id, req.params.name);
            return ResponseView.success(res, result, 'Folder deleted and notes moved to trash');
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new FolderController();
