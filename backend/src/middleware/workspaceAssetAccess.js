const { Asset } = require('../models');
const logger = require('../utils/logger');
const { belongsToWorkspace } = require('../utils/workspaceScope');

module.exports = async function workspaceAssetAccess(req, res, next) {
  try {
    const assetId = req.params.id || req.params.assetId || req.body?.assetId;
    if (!assetId) return next();
    const asset = await Asset.findByPk(assetId, { attributes: ['id', 'workspaceId'] });
    if (!asset) return next(); // Preserve the controller's established 404 response.
    if (!asset.workspaceId) {
      return res.status(403).json({ message: 'Forbidden: Legacy asset requires workspace assignment' });
    }
    if (!belongsToWorkspace(asset, req.user)) {
      return res.status(403).json({ message: 'Forbidden: Asset belongs to another workspace' });
    }
    next();
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
