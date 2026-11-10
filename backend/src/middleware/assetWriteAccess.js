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
    const edits = require('../services/assetEditSessions');
    if (edits.enabled()) {
      const db = require('../models');
      await db.sequelize.transaction(async transaction => {
        const current = await db.Asset.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!current) throw edits.fail('NOT_FOUND', 'Asset not found.', 404);
        await edits.guard(current, req, transaction, { file: /\/versions\/upload$/.test(req.path) });
      });
    }
    next();
  } catch (error) {
    logger.error(error);
    res.status(error.status || 500).json({ code: error.code, message: error.status ? error.message : 'Server error' });
  }
};
