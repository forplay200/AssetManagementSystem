const { Asset } = require('../models');
const logger = require('../utils/logger');
const { belongsToWorkspace } = require('../utils/workspaceScope');

module.exports = async function workspaceAssetAccess(req, res, next) {
  try {
    const assetId = req.params.id || req.params.assetId || req.body?.assetId;
    if (!assetId) return next();
    const governance = process.env.ASSET_GOVERNANCE_ENABLED === 'true';
    const asset = await Asset.findByPk(assetId, { attributes: ['id', 'workspaceId', ...(governance ? ['lifecycleState'] : [])] });
    if (!asset) return next(); // Preserve the controller's established 404 response.
    if (!asset.workspaceId) {
      return res.status(403).json({ message: 'Forbidden: Legacy asset requires workspace assignment' });
    }
    if (!belongsToWorkspace(asset, req.user)) {
      return res.status(403).json({ message: 'Forbidden: Asset belongs to another workspace' });
    }
    if (governance && asset.lifecycleState !== 'active') return res.status(410).json({ code: 'ASSET_TRASHED', message: 'Asset is in the recycle bin or being permanently cleaned.' });
    next();
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
