const express = require('express');
const auth = require('../middleware/auth');
const requireWorkspace = require('../middleware/requireWorkspace');
const { authorizePermission } = require('../middleware/rbac');
const { updateComment, deleteComment } = require('../controllers/commentsController');

const router = express.Router();
const workspaceAuth = [auth, requireWorkspace];

router.put('/:id', workspaceAuth, authorizePermission('comment'), updateComment);
router.delete('/:id', workspaceAuth, authorizePermission('comment'), deleteComment);

module.exports = router;
