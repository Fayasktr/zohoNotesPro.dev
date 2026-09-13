const express = require('express');
const router = express.Router();
const shareController = require('../controllers/share.controller');
const authenticate = require('../middlewares/auth.middleware');

router.use(authenticate);

router.post('/invite', (req, res, next) => shareController.invite(req, res, next));
router.get('/invites', (req, res, next) => shareController.getMyInvitations(req, res, next));
router.get('/my-shared', (req, res, next) => shareController.getMySharedNotebooks(req, res, next));
router.post('/respond', (req, res, next) => shareController.respond(req, res, next));

module.exports = router;
