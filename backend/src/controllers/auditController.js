const db = require('../models');
const { enabled, createEditService, fail } = require('../services/assetEditSessions');
const { createAuditService } = require('../services/auditService');
const filter = query => Object.fromEntries(['cursor', 'limit', 'action', 'actorId', 'actorName', 'targetName', 'category', 'result', 'from', 'to'].filter(key => typeof query[key] === 'string').map(key => [key, query[key]]));
function handle(assetScope) {
  return async (req, res) => {
    if (!enabled()) return res.status(404).json({ message: 'Audit log is not enabled.' });
    try {
      let asset;
      if (assetScope) {
        asset = await db.Asset.findByPk(req.params.id);
        if (!asset) throw fail('NOT_FOUND', 'Asset not found.', 404);
        if (asset.lifecycleState !== 'active') throw fail('ASSET_TRASHED', 'Asset is not available.', 410);
      }
      const workspaceId = Number(req.user.workspaceId);
      await createEditService(db).actorFor(req.user, asset || { workspaceId }, undefined, false);
      const events = await createAuditService(db).list({ ...filter(req.query), workspaceId,
        scope: assetScope ? 'asset' : 'workspace', assetId: assetScope ? asset.id : req.query.assetId });
      const ids = [...new Set(events.events.map(event => event.assetId).filter(Boolean))];
      const assets = ids.length ? await db.Asset.findAll({ where: { workspaceId, id: { [db.Sequelize.Op.in]: ids } }, attributes: ['id', 'lifecycleState'] }) : [];
      res.setHeader('Cache-Control', 'private, no-store');
      res.json({ ...events, events: events.events.map(event => ({ ...event.toJSON(), assetAvailable: assets.some(a => a.id === event.assetId && a.lifecycleState === 'active') })) });
    } catch (error) {
      if (!error.status && !(error instanceof TypeError)) require('../utils/logger').error(error);
      res.status(error.status || (error instanceof TypeError ? 400 : 500)).json({ message: error.status || error instanceof TypeError ? error.message : 'Audit log could not be loaded.' });
    }
  };
}
exports.workspace = handle(false); exports.asset = handle(true);
