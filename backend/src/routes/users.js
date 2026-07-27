const express = require('express');
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');
const { authorizeAccountPermission } = require('../middleware/rbac');

const router = express.Router();

// System Administration is platform-scoped. Workspace roles never satisfy
// this account-level permission check.
router.use(auth);
router.use(authorizeAccountPermission('manageUsers'));

router.get('/', userController.getAllUsers);
router.get('/:id', userController.getUserById);
router.patch('/:id/status', userController.updateAccountStatus);

module.exports = router;
