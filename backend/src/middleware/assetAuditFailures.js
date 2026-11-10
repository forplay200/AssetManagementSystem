const { enabled, createEditService } = require('../services/assetEditSessions');
const { positiveId } = require('../utils/assetPermissions');
const { createAuditService } = require('../services/auditService');
function operation(req) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return null;
  if (req.path === '/upload') return { action: 'asset.uploaded' };
  if (req.path === '/ai/job') return { action: 'asset.ai_requested', id: positiveId(req.body?.assetId) };
  const match = req.path.match(/^\/(\d+)(?:\/(.*))?$/);
  if (!match) return null;
  const action = !match[2] && req.method === 'DELETE' ? 'asset.trashed'
    : match[2] === 'name' ? 'asset.renamed' : match[2] === 'metadata' ? 'asset.metadata_changed'
      : /^tags(?:\/[^/]+)?$/.test(match[2] || '') ? 'asset.tags_changed'
        : match[2] === 'versions/upload' ? 'asset.version_uploaded' : match[2] === 'versions' ? 'asset.snapshot_created'
          : /^ai-jobs\/[^/]+\/review$/.test(match[2] || '') ? 'asset.ai_reviewed'
            : match[2] === 'ai-suggestions/apply' ? 'asset.ai_completed' : match[2] === 'comments' ? 'comment.created' : null;
  return action ? { action, id: positiveId(match[1]) } : null;
}
module.exports = function assetAuditFailures(req, res, next) {
  if (!enabled()) return next();
  const op = operation(req);
  if (!op) return next();
  res.once('finish', () => {
    if (res.statusCode < 400 || !positiveId(req.user?.workspaceId)) return;
    const record = async () => {
      const db = require('../models'); const workspaceId = positiveId(req.user.workspaceId);
      const asset = op.id ? await db.Asset.findOne({ where: { id: op.id, workspaceId } }) : null;
      // Do not turn cross-workspace guesses into readable target information.
      if (op.id && !asset) return;
      const actor = await createEditService(db).actorFor(req.user, asset || { workspaceId }, undefined, false);
      await createAuditService(db).append({ workspaceId, asset, actor, action: op.action,
        result: res.statusCode >= 500 ? 'failed' : 'denied', targetName: op.id ? undefined : 'Asset upload',
        details: { httpStatus: res.statusCode, changed: false } });
    };
    record().catch(error => { if (!error.status) require('../utils/logger').error(error); });
  });
  next();
};
module.exports.operation = operation;
