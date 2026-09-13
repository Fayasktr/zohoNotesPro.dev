const shareService = require('../services/share.service');
const ResponseView = require('../views/response.view');

class ShareController {
    /**
     * POST /api/share/invite
     */
    async invite(req, res, next) {
        try {
            const { notebookId, email } = req.body;
            const result = await shareService.inviteCollaborator(req.user.id, { notebookId, email });
            return ResponseView.success(res, result, result.message);
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /api/share/invites
     */
    async getMyInvitations(req, res, next) {
        try {
            const invites = await shareService.getMyInvitations(req.user.id);
            return ResponseView.success(res, invites);
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /api/share/my-shared
     */
    async getMySharedNotebooks(req, res, next) {
        try {
            const shared = await shareService.getMySharedNotebooks(req.user.id);
            return ResponseView.success(res, shared);
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/share/respond
     */
    async respond(req, res, next) {
        try {
            const { notebookId, response } = req.body;
            const result = await shareService.respondToInvitation(req.user.id, { notebookId, response });
            return ResponseView.success(res, result, `Invitation ${response}`);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new ShareController();
