'use strict';
const { randomUUID } = require('node:crypto');
const { WORKSPACE_ROLES } = require('../utils/roles');
const { canManageAsset, positiveId } = require('../utils/assetPermissions');
const { createAuditService } = require('./auditService');
const { createEditService, fail } = require('./assetEditSessions');
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const canObjectToCycle = (actor, cycle) => actor.id === cycle.uploaderId && actor.id !== cycle.deletedBy;
const canRestoreCycle = (actor, cycle) =>
  canManageAsset(actor, { workspaceId: cycle.workspaceId, userId: cycle.uploaderId })
  || (actor.id === cycle.uploaderId && actor.id === cycle.deletedBy);

function createLifecycleService(db, clock = () => new Date()) {
  const audit = createAuditService(db);
  const edits = createEditService(db, clock);
  async function currentActor(user, transaction) {
    return edits.actorFor(user, { workspaceId: Number(user.workspaceId) }, transaction, false);
  }
  async function notify(recipientId, cycle, event, type, transaction) {
    return db.Notification.create({ id: randomUUID(), recipientId, workspaceId: cycle.workspaceId,
      type, cycleId: cycle.id, eventId: event.id, content: { assetId: cycle.assetId, name: cycle.targetName, deletedBy: cycle.deletedBy, reason: cycle.reason, purgeAfter: cycle.purgeAfter }, createdAt: clock() }, { transaction });
  }
  async function trash(assetId, user, auth = {}, reason) {
    if (reason != null && (typeof reason !== 'string' || reason.length > 1000)) throw fail('INVALID_REASON', 'Use a deletion reason of at most 1000 characters.', 400);
    return db.sequelize.transaction(async transaction => {
      const asset = await db.Asset.findByPk(assetId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!asset) throw fail('NOT_FOUND', 'Asset not found.', 404);
      const { actor, session } = await edits.validate(asset, user, auth, transaction, { deletion: true });
      if (actor.id !== asset.userId && !reason?.trim()) throw fail('REASON_REQUIRED', 'Provide a reason when deleting another member’s asset.', 400);
      const now = clock();
      const uploader = await db.User.findByPk(asset.userId, { transaction });
      const uploaderMember = await db.TeamMember.findOne({ where: { teamId: asset.workspaceId, userId: asset.userId }, transaction });
      const cycle = await db.AssetTrashCycle.create({ id: randomUUID(), assetId: asset.id, workspaceId: asset.workspaceId,
        uploaderId: asset.userId, targetName: asset.displayName || asset.originalname, deletedBy: actor.id,
        reason: reason?.trim() || null, deletedAt: now, purgeAfter: new Date(now.getTime() + RETENTION_MS), status: 'trashed',
        holdReason: uploader?.isActive === true && uploader.role !== 'systemAdministrator' && uploaderMember ? null : 'UPLOADER_UNAVAILABLE' }, { transaction });
      asset.lifecycleState = 'trashed'; asset.revision += 1; asset.aiRequestContext = null; asset.pendingAiResult = null;
      await asset.save({ transaction });
      await db.AssetAiJob.update({ status: 'cancelled', leaseExpiresAt: null, finishedAt: now }, { where: { assetId: asset.id, status: { [db.Sequelize.Op.in]: ['queued', 'processing'] } }, transaction });
      if (session) {
        await session.destroy({ transaction });
        await audit.append({ workspaceId: asset.workspaceId, asset, actor, action: 'lock.released', details: { reason: 'Asset moved to recycle bin' } }, transaction);
      }
      // Also discard expired leases so a restored asset never reuses an old editing token.
      await db.AssetEditSession.destroy({ where: { assetId: asset.id }, transaction });
      const event = await audit.append({ workspaceId: asset.workspaceId, asset, actor, action: 'asset.trashed',
        before: { lifecycleState: 'active' }, after: { lifecycleState: 'trashed' }, details: { cycleId: cycle.id, reason: cycle.reason, purgeAfter: cycle.purgeAfter } }, transaction);
      await notify(asset.userId, cycle, event, 'asset.trashed', transaction);
      return cycle;
    });
  }
  async function restore(assetId, cycleId, user, objection = false, reason) {
    if (!UUID.test(cycleId || '')) throw fail('INVALID_CYCLE', 'A valid deletion cycle is required.', 400);
    if (reason != null && (typeof reason !== 'string' || reason.length > 1000)) throw fail('INVALID_REASON', 'Use at most 1000 characters.', 400);
    return db.sequelize.transaction(async transaction => {
      const asset = await db.Asset.findByPk(assetId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!asset) throw fail('NOT_FOUND', 'Asset not found.', 404);
      const actor = await edits.actorFor(user, asset, transaction, false);
      const cycle = await db.AssetTrashCycle.findOne({ where: { id: cycleId, assetId: asset.id, workspaceId: asset.workspaceId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!cycle) throw fail('NOT_FOUND', 'Deletion cycle not found.', 404);
      if (!(objection ? canObjectToCycle(actor, cycle) : canRestoreCycle(actor, cycle))) throw fail('PERMISSION_CHANGED', 'You cannot restore this asset using this action.', 403);
      if (cycle.status === 'restored' && asset.lifecycleState === 'active') return { restored: true, cycleId: cycle.id, alreadyRestored: true };
      if (cycle.status !== 'trashed' || asset.lifecycleState !== 'trashed') throw fail('PURGE_STARTED', 'Permanent cleanup has started or this deletion cycle has ended.');
      // An unavailable uploader's protection window is paused until they can use it again.
      if (!cycle.holdReason && new Date(cycle.purgeAfter) <= clock()) throw fail('RETENTION_EXPIRED', 'The seven-day recovery window has ended.');
      cycle.status = 'restored'; cycle.restoredBy = actor.id; cycle.restoredAt = clock(); cycle.holdReason = null;
      await cycle.save({ transaction });
      asset.lifecycleState = 'active'; asset.revision += 1;
      await asset.save({ transaction });
      const event = await audit.append({ workspaceId: asset.workspaceId, asset, actor,
        action: objection ? 'asset.objected_restored' : 'asset.restored', before: { lifecycleState: 'trashed' }, after: { lifecycleState: 'active' },
        details: { cycleId: cycle.id, reason: reason?.trim() || null } }, transaction);
      await notify(cycle.deletedBy, cycle, event, objection ? 'asset.objected_restored' : 'asset.restored', transaction);
      return { restored: true, cycleId: cycle.id };
    });
  }
  async function preview(assetId, cycleId, user) {
    const id = positiveId(assetId);
    if (!id || id > 2147483647 || !UUID.test(cycleId || '')) throw fail('NOT_FOUND', 'Deleted asset not found.', 404);
    return db.sequelize.transaction(async transaction => {
      const actor = await currentActor(user, transaction);
      const asset = await db.Asset.findOne({ where: { id, workspaceId: actor.workspaceId, lifecycleState: 'trashed' }, transaction, lock: transaction.LOCK.SHARE });
      if (!asset) throw fail('NOT_FOUND', 'Deleted asset not found.', 404);
      const where = { id: cycleId, assetId: asset.id, workspaceId: actor.workspaceId, status: 'trashed' };
      if (actor.teamRole !== WORKSPACE_ROLES.OWNER) where.uploaderId = actor.id;
      if (!await db.AssetTrashCycle.findOne({ where, transaction })) throw fail('NOT_FOUND', 'Deleted asset not found.', 404);
      return asset;
    });
  }
  async function list(user, { page = 1, limit = 30, cycleId } = {}) {
    const actor = await currentActor(user);
    const take = Math.min(100, Math.max(1, Math.floor(Number(limit) || 30)));
    const offset = (Math.min(10000, Math.max(1, Math.floor(Number(page) || 1))) - 1) * take;
    const where = { workspaceId: actor.workspaceId, status: { [db.Sequelize.Op.in]: ['trashed', 'purging'] } };
    if (cycleId) { if (!UUID.test(cycleId)) throw fail('INVALID_CYCLE', 'Invalid deletion cycle.', 400); where.id = cycleId; }
    if (actor.teamRole !== WORKSPACE_ROLES.OWNER) where.uploaderId = actor.id;
    const { rows, count } = await db.AssetTrashCycle.findAndCountAll({ where, order: [['deletedAt', 'DESC'], ['id', 'DESC']], offset, limit: take });
    const jobs = rows.length ? await db.AssetPurgeJob.findAll({ where: { cycleId: { [db.Sequelize.Op.in]: rows.map(row => row.id) } }, attributes: ['cycleId', 'status', 'nextAttemptAt', 'lastError'] }) : [];
    const people = rows.length ? await db.User.findAll({ where: { id: { [db.Sequelize.Op.in]: [...new Set(rows.flatMap(row => [row.uploaderId, row.deletedBy]))] } }, attributes: ['id', 'username'] }) : [];
    const trashedIds = rows.filter(row => row.status === 'trashed').map(row => row.assetId);
    const assets = trashedIds.length ? await db.Asset.findAll({
      where: { workspaceId: actor.workspaceId, lifecycleState: 'trashed', id: { [db.Sequelize.Op.in]: trashedIds } },
      attributes: ['id', 'originalname', 'mimetype', 'size']
    }) : [];
    const previews = new Map(assets.map(asset => [asset.id, asset.toJSON()]));
    const cycles = rows.map(row => {
      const cycle = row.toJSON();
      const recoverable = cycle.status === 'trashed' && (Boolean(cycle.holdReason) || new Date(cycle.purgeAfter) > clock());
      const job = jobs.find(j => j.cycleId === cycle.id);
      return {
        ...cycle,
        uploaderName: people.find(p => p.id === cycle.uploaderId)?.username || `Member #${cycle.uploaderId}`,
        deletedByName: people.find(p => p.id === cycle.deletedBy)?.username || `Member #${cycle.deletedBy}`,
        cleanup: job ? { status: job.status, nextAttemptAt: job.nextAttemptAt, message: job.lastError } : null,
        canRestore: recoverable && canRestoreCycle(actor, cycle),
        canObject: recoverable && canObjectToCycle(actor, cycle),
        preview: cycle.status === 'trashed' ? previews.get(cycle.assetId) || null : null
      };
    });
    return { cycles, total: count, page: Math.floor(offset / take) + 1, pageSize: take };
  }
  async function notifications(user, { page = 1 } = {}) {
    const actor = await currentActor(user);
    const offset = (Math.min(10000, Math.max(1, Math.floor(Number(page) || 1))) - 1) * 30;
    const { rows, count } = await db.Notification.findAndCountAll({ where: { workspaceId: actor.workspaceId, recipientId: actor.id }, order: [['createdAt', 'DESC'], ['id', 'DESC']], offset, limit: 30 });
    const unread = await db.Notification.count({ where: { workspaceId: actor.workspaceId, recipientId: actor.id, readAt: null } });
    return { notifications: rows, total: count, unread, page: offset / 30 + 1, pageSize: 30 };
  }
  async function markRead(id, user) {
    if (!UUID.test(id || '')) throw fail('NOT_FOUND', 'Notification not found.', 404);
    const actor = await currentActor(user);
    await db.Notification.update({ readAt: clock() }, { where: { id, workspaceId: actor.workspaceId, recipientId: actor.id, readAt: null } });
    return { read: true };
  }
  return { trash, restore, preview, list, notifications, markRead, notify };
}
async function holdForUploader(db, uploaderId, workspaceId, transaction) {
  const where = { uploaderId, status: 'trashed', holdReason: null, ...(workspaceId ? { workspaceId } : {}) };
  const cycles = await db.AssetTrashCycle.findAll({ where, order: [['assetId', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
  for (const cycle of cycles) {
    await cycle.update({ holdReason: 'UPLOADER_UNAVAILABLE' }, { transaction });
    const asset = await db.Asset.findByPk(cycle.assetId, { transaction });
    if (asset) await createAuditService(db).append({ workspaceId: cycle.workspaceId, asset, action: 'asset.purge_paused', details: { cycleId: cycle.id, reason: 'UPLOADER_UNAVAILABLE' } }, transaction);
  }
}
module.exports = { RETENTION_MS, createLifecycleService, holdForUploader };
