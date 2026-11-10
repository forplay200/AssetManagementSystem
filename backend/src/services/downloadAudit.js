const { randomUUID } = require('node:crypto');
const { enabled, createEditService, fail } = require('./assetEditSessions');
const { createAuditService } = require('./auditService');
const { WORKSPACE_ROLES } = require('../utils/roles');
async function beginDownload(req, res, asset, details) {
  if (!enabled()) return async () => {};
  const db = require('../models'); const audit = createAuditService(db);
  const correlationId = randomUUID();
  const actor = await db.sequelize.transaction(async transaction => {
    const current = asset && await db.Asset.findByPk(asset.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!current) throw fail('NOT_FOUND', 'Asset not found.', 404);
    const currentActor = await createEditService(db).actorFor(req.user, current, transaction, false);
    if (![WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.MANAGER].includes(currentActor.teamRole)) throw fail('PERMISSION_CHANGED', 'Downloads are not permitted for this role.', 403);
    if (current.lifecycleState !== 'active') throw fail('ASSET_TRASHED', 'Asset is not available.', 410);
    await audit.append({ workspaceId: current.workspaceId, asset, actor: currentActor, action: 'asset.download', result: 'requested', correlationId, details }, transaction);
    return currentActor;
  });
  let ended = false;
  const finish = async result => {
    if (ended) return;
    ended = true;
    // A process crash may leave only the durable requested event. Never infer local saving.
    await audit.append({ workspaceId: asset.workspaceId, asset, actor, action: 'asset.download', result, correlationId, details });
  };
  const observe = result => finish(result).catch(error => require('../utils/logger').error(error));
  res.once('finish', () => observe(res.statusCode >= 400 ? 'failed' : 'completed'));
  res.once('close', () => observe(res.writableFinished ? (res.statusCode >= 400 ? 'failed' : 'completed') : 'interrupted'));
  if (res.destroyed) await finish('interrupted');
  return finish;
}
module.exports = { beginDownload };
