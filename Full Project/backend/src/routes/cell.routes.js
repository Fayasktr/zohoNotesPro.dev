const express = require('express');
const router = express.Router();
const cellController = require('../controllers/cell.controller');
const authenticate = require('../middlewares/auth.middleware');

router.use(authenticate);

router.post('/trash', (req, res, next) => cellController.trashCell(req, res, next));
router.post('/restore/:id', (req, res, next) => cellController.restoreCell(req, res, next));
router.delete('/:id', (req, res, next) => cellController.deleteCellPermanently(req, res, next));

module.exports = router;
