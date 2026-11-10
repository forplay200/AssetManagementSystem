const edits = require('../services/assetEditSessions');
const { createLifecycleService } = require('../services/assetLifecycle');
const handle = action => async (req, res) => {
  if (!edits.enabled()) return res.status(404).json({ message: 'Recycle bin is not enabled.' });
  try { res.setHeader('Cache-Control', 'private, no-store'); res.json(await action(createLifecycleService(require('../models')), req)); }
  catch (error) {
    if (!error.status) require('../utils/logger').error(error);
    res.status(error.status || 500).json({ code: error.code, message: error.status ? error.message : 'Recycle bin operation failed.' });
  }
};
exports.list = handle((s, req) => s.list(req.user, req.query));
exports.notifications = handle((s, req) => s.notifications(req.user, req.query));
exports.markRead = handle((s, req) => s.markRead(req.params.id, req.user));
exports.restore = handle((s, req) => s.restore(req.params.id, req.body.cycleId, req.user, false));
exports.objectAndRestore = handle((s, req) => s.restore(req.params.id, req.body.cycleId, req.user, true, req.body.reason));
exports.authorizePreview = async (req, res, next) => {
  if (!edits.enabled()) return res.status(404).json({ message: 'Recycle bin is not enabled.' });
  try {
    req.recycleBinAsset = await createLifecycleService(require('../models')).preview(req.params.id, req.params.cycleId, req.user);
    next();
  } catch (error) {
    if (!error.status) return next(error);
    res.status(error.status).json({ code: error.code, message: error.message });
  }
};
