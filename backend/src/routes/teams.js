const express = require('express');
const auth = require('../middleware/auth');
const { authorizePermission } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const teamController = require('../controllers/teamController');

const router = express.Router();
router.use(auth);

router.get('/', teamController.listTeams);
router.post('/', validate({ body: { name: { type: 'string', required: true, minLength: 2 } } }), teamController.createTeam);
router.post('/join', validate({ body: { inviteCode: { type: 'string', required: true, minLength: 6 } } }), teamController.joinTeam);
router.get('/current', authorizePermission('viewAsset'), teamController.getCurrentTeam);
router.patch('/current/members/:userId', authorizePermission('manageTeam'), teamController.updateMemberRole);
router.delete('/current/members/:userId', authorizePermission('manageTeam'), teamController.removeMember);
router.post('/current/invite-code', authorizePermission('manageTeam'), teamController.regenerateInviteCode);

module.exports = router;
