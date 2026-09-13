const express = require('express');
const router = express.Router();
const folderController = require('../controllers/folder.controller');
const authenticate = require('../middlewares/auth.middleware');

router.use(authenticate);

router.get('/', (req, res, next) => folderController.listFolders(req, res, next));
router.put('/rename', (req, res, next) => folderController.renameFolder(req, res, next));
router.delete('/:name', (req, res, next) => folderController.deleteFolder(req, res, next));

module.exports = router;
