const express = require('express');
const router = express.Router();
const syncController = require('../controllers/sync.controller');
const authenticate = require('../middlewares/auth.middleware');

router.use(authenticate);

// Local-first Hydration & Atlas Backup
router.get('/hydrate', (req, res, next) => syncController.hydrate(req, res, next));
router.get('/manifest', (req, res, next) => syncController.manifest(req, res, next));
router.post('/pull', (req, res, next) => syncController.pull(req, res, next));
router.post('/push', (req, res, next) => syncController.push(req, res, next));
router.get('/status', (req, res, next) => syncController.status(req, res, next));

module.exports = router;
