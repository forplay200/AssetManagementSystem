const edits = require('../services/assetEditSessions');
function handle(method) {
  return async (req, res) => {
    if (!edits.enabled()) return res.status(404).json({ message: 'Asset editing sessions are not enabled.' });
    try {
      const result = await edits.service()[method](req.params.id, req.user, edits.credentials(req));
      res.setHeader('Cache-Control', 'private, no-store');
      res.json(result);
    } catch (error) {
      if (!error.status) require('../utils/logger').error(error);
      res.status(error.status || 500).json({ code: error.code, message: error.status ? error.message : 'Edit session could not be updated.' });
    }
  };
}
exports.status = handle('status'); exports.acquire = handle('acquire'); exports.heartbeat = handle('heartbeat'); exports.release = handle('release');
