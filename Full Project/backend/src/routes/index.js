const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const noteRoutes = require('./note.routes');
const cellRoutes = require('./cell.routes');
const folderRoutes = require('./folder.routes');
const syncRoutes = require('./sync.routes');
const shareRoutes = require('./share.routes');
const executeRoutes = require('./execute.routes');
const adminRoutes = require('./admin.routes');
const healthRoutes = require('./health.routes');

// Mount Subrouters
router.use('/auth', authRoutes);
router.use('/notebooks', noteRoutes);
router.use('/cells', cellRoutes);
router.use('/folders', folderRoutes);
router.use('/sync', syncRoutes);
router.use('/backup', syncRoutes); // Alias for backward compatibility
router.use('/share', shareRoutes);
router.use('/execute', executeRoutes);
router.use('/admin', adminRoutes);
router.use('/', healthRoutes);

module.exports = router;
