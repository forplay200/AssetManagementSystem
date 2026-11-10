const router = require('express').Router();
const auth = require('../middleware/auth');
const { denySystemAdministrator } = require('../middleware/rbac');
const requireWorkspace = require('../middleware/requireWorkspace');
const controller = require('../controllers/recycleBinController');
router.use(auth, denySystemAdministrator, requireWorkspace);
router.get('/', controller.notifications);
router.patch('/:id/read', controller.markRead);
module.exports = router;
