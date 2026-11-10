const express = require('express');
const auth = require('../middleware/auth');
const { authorizePermission, denySystemAdministrator } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const teamController = require('../controllers/teamController');

const requireWorkspace = require('../middleware/requireWorkspace');
const validateName = require('../middleware/validateName');
const router = express.Router();
router.use(auth);
router.use(denySystemAdministrator);
const recycleBin = require('../controllers/recycleBinController');
router.get('/current/usage', requireWorkspace, authorizePermission('viewAsset'), async (req, res) => {
  try {
    const policy = require('../services/trialPolicy');
    if (!policy.enabled()) return res.json({ enabled: false });
    const { minioClient, BUCKET_NAME } = require('../utils/minioClient');
    const usage = await require('../services/resourceQuota').usage(require('../models'), minioClient, BUCKET_NAME, req.user.workspaceId);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ enabled: true, workspaceBytes: usage.workspaceBytes, workspaceLimitBytes: usage.workspaceLimitBytes, aiDailyLimit: policy.limit('TRIAL_AI_PER_DAY', 20) });
  } catch (error) { res.status(503).json({ message: 'Usage could not be loaded. Please retry later.' }); }
});
router.get('/current/recycle-bin', requireWorkspace, authorizePermission('viewAsset'), recycleBin.list);
router.get('/current/audit-events', requireWorkspace, authorizePermission('viewAsset'), require('../controllers/auditController').workspace);

router.get('/', teamController.listTeams);
router.post('/', validate({ body: { name: { type: 'string', required: true, minLength: 2 } } }), teamController.createTeam);
router.post('/join', validate({ body: { inviteCode: { type: 'string', required: true, minLength: 6 } } }), teamController.joinTeam);
router.patch('/current/name', requireWorkspace, authorizePermission('manageTeam'), validateName('name', 2, 100), teamController.renameTeam);
router.get('/current', authorizePermission('viewAsset'), teamController.getCurrentTeam);
router.patch('/current/members/:userId', authorizePermission('manageTeam'), teamController.updateMemberRole);
router.delete('/current/members/:userId', authorizePermission('manageTeam'), teamController.removeMember);
router.post('/current/invite-code', authorizePermission('manageTeam'), teamController.regenerateInviteCode);

module.exports = router;
