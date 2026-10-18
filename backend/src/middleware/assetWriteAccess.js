const { Asset } = require('../models');
const { canManageAsset, ASSET_WRITE_DENIED } = require('../utils/assetPermissions');
const logger = require('../utils/logger');

// Reject replacement uploads before receiving multipart files. Controllers
// recheck the asset inside their transaction before writing storage or history.
module.exports = async function assetWriteAccess(req, res, next) {
  try {
    const asset = await Asset.findByPk(req.params.id, { attributes: ['id', 'workspaceId', 'userId'] });
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    if (!canManageAsset(req.user, asset)) return res.status(403).json({ message: ASSET_WRITE_DENIED });
    next();
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
