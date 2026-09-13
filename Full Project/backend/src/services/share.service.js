const Note = require('../models/Note');
const User = require('../models/User');

class ShareService {
    /**
     * Invite a collaborator to a notebook
     */
    async inviteCollaborator(currentUserId, { notebookId, email }) {
        if (!email || !notebookId) {
            const err = new Error('Email and notebookId are required');
            err.statusCode = 400;
            throw err;
        }

        const targetEmail = email.toLowerCase().trim();
        const targetUser = await User.findOne({ email: targetEmail });
        if (!targetUser) {
            const err = new Error('User not found with this email');
            err.statusCode = 404;
            throw err;
        }

        if (String(targetUser._id) === String(currentUserId)) {
            const err = new Error('You cannot share a notebook with yourself');
            err.statusCode = 400;
            throw err;
        }

        const notebook = await Note.findOne({ id: notebookId, owner: currentUserId });
        if (!notebook) {
            const err = new Error('Notebook not found or you are not the owner');
            err.statusCode = 404;
            throw err;
        }

        const alreadyShared = notebook.collaborators.find(
            c => c.user && String(c.user) === String(targetUser._id)
        );

        if (alreadyShared) {
            const err = new Error('Notebook is already shared with this user');
            err.statusCode = 409;
            throw err;
        }

        notebook.collaborators.push({
            user: targetUser._id,
            email: targetUser.email,
            status: 'pending',
            joinedAt: new Date()
        });

        await notebook.save();

        return {
            message: `Invitation successfully sent to ${targetEmail}`,
            targetUser: { id: targetUser._id, username: targetUser.username, email: targetUser.email }
        };
    }

    /**
     * Get pending invitations for the current user
     */
    async getMyInvitations(currentUserId) {
        const notebooks = await Note.find({
            'collaborators.user': currentUserId,
            'collaborators.status': 'pending'
        }, 'id title owner createdAt').populate('owner', 'username email avatar').lean();

        return notebooks.map(nb => ({
            notebookId: nb.id,
            title: nb.title,
            ownerName: nb.owner?.username || 'Unknown',
            ownerEmail: nb.owner?.email || '',
            ownerAvatar: nb.owner?.avatar || '',
            invitedAt: nb.createdAt
        }));
    }

    /**
     * Get notebooks shared by the current user with others
     */
    async getMySharedNotebooks(currentUserId) {
        return await Note.find({
            owner: currentUserId,
            'collaborators.0': { $exists: true }
        }, 'id title collaborators updatedAt').populate('collaborators.user', 'username email avatar').lean();
    }

    /**
     * Respond to a notebook invitation (accept or decline)
     */
    async respondToInvitation(currentUserId, { notebookId, response }) {
        if (!notebookId || !response || !['accepted', 'declined'].includes(response)) {
            const err = new Error("Response must be 'accepted' or 'declined'");
            err.statusCode = 400;
            throw err;
        }

        const notebook = await Note.findOne({
            id: notebookId,
            'collaborators.user': currentUserId
        });

        if (!notebook) {
            const err = new Error('Invitation not found');
            err.statusCode = 404;
            throw err;
        }

        if (response === 'accepted') {
            await Note.updateOne(
                { id: notebookId, 'collaborators.user': currentUserId },
                {
                    $set: {
                        'collaborators.$.status': 'accepted',
                        'collaborators.$.joinedAt': new Date()
                    }
                }
            );
        } else {
            // Remove collaborator entry on decline
            await Note.updateOne(
                { id: notebookId },
                { $pull: { collaborators: { user: currentUserId } } }
            );
        }

        return { success: true, status: response };
    }
}

module.exports = new ShareService();
