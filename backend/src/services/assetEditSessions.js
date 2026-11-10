'use strict';
const crypto = require('node:crypto');
const { canManageAsset } = require('../utils/assetPermissions');
const { createAuditService } = require('./auditService');
const LEASE_MS = 30 * 60 * 1000;
const enabled = () => process.env.ASSET_GOVERNANCE_ENABLED === 'true';
const fail = (code, message, status = 409) => Object.assign(new Error(message), { code, status });
const digest = token => crypto.createHash('sha256').update(String(token)).digest('hex');
const credentials = req => ({ token: req.get?.('X-Asset-Edit-Token'), revision: req.get?.('X-Asset-Revision'), baseContentVersionId: req.get?.('X-Asset-Base-Version') });

function createEditService(db, clock = () => new Date()) {
  const audit = createAuditService(db);
  async function actorFor(user, asset, transaction, write = true) {
    if (Number(user?.workspaceId) !== Number(asset.workspaceId)) throw fail('PERMISSION_CHANGED', 'Asset not found.', 404);
    const account = await db.User.findByPk(user.id, { transaction });
    const member = await db.TeamMember.findOne({ where: { teamId: asset.workspaceId, userId: user.id }, transaction });
    const actor = account && member ? { id: account.id, role: account.role, isActive: account.isActive, username: account.username, workspaceId: asset.workspaceId, teamRole: member.role } : null;
    if (!actor || actor.isActive === false || actor.role === 'systemAdministrator' || write && !canManageAsset(actor, asset)) throw fail('PERMISSION_CHANGED', 'Your asset permissions changed.', 403);
    return actor;
  }
  function active(asset) {
    if (asset.lifecycleState !== 'active') throw fail('ASSET_TRASHED', 'This asset is no longer available for editing.');
  }
  async function lockedAsset(id, user, action, write = true) {
    return db.sequelize.transaction(async transaction => {
      const asset = await db.Asset.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!asset) throw fail('NOT_FOUND', 'Asset not found.', 404);
      const actor = await actorFor(user, asset, transaction, write);
      active(asset);
      return action(asset, actor, transaction);
    });
  }
  const event = (asset, actor, action, transaction, details) => audit.append({ workspaceId: asset.workspaceId, asset, actor, action, details }, transaction);
  async function acquire(id, user) {
    return lockedAsset(id, user, async (asset, actor, transaction) => {
      let session = await db.AssetEditSession.findOne({ where: { assetId: asset.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (session && new Date(session.expiresAt) > clock()) {
        // A removed/demoted holder cannot keep blocking another editor until lease expiry.
        try { await actorFor({ id: session.holderUserId, workspaceId: asset.workspaceId }, asset, transaction); }
        catch (error) {
          if (error.code !== 'PERMISSION_CHANGED') throw error;
          await event(asset, null, 'lock.revoked', transaction, { holderUserId: session.holderUserId });
          await session.destroy({ transaction }); session = null;
        }
      }
      if (session && new Date(session.expiresAt) > clock()) throw fail('ASSET_LOCKED', 'Someone is already editing this asset.');
      if (session) { await event(asset, null, 'lock.expired', transaction, { holderUserId: session.holderUserId }); await session.destroy({ transaction }); }
      if (!asset.contentVersionId) { asset.contentVersionId = crypto.randomUUID(); await asset.save({ transaction }); }
      const token = crypto.randomBytes(32).toString('hex');
      const now = clock();
      session = await db.AssetEditSession.create({ id: crypto.randomUUID(), assetId: asset.id, workspaceId: asset.workspaceId, holderUserId: actor.id,
        tokenHash: digest(token), baseRevision: asset.revision, baseContentVersionId: asset.contentVersionId,
        acquiredAt: now, heartbeatAt: now, expiresAt: new Date(now.getTime() + LEASE_MS) }, { transaction });
      await event(asset, actor, 'lock.acquired', transaction);
      return { sessionId: session.id, token, revision: asset.revision, baseContentVersionId: asset.contentVersionId, expiresAt: session.expiresAt };
    });
  }
  async function validate(asset, user, auth, transaction, { deletion = false, file = false, checkRevision = true } = {}) {
    active(asset);
    const actor = await actorFor(user, asset, transaction);
    const session = await db.AssetEditSession.findOne({ where: { assetId: asset.id }, transaction, lock: transaction.LOCK.UPDATE });
    const valid = session && new Date(session.expiresAt) > clock();
    if (deletion && !auth.token && !valid) return { actor, session: null };
    if (!valid) throw fail('LOCK_EXPIRED', 'Start editing again. Your edit session is missing or expired.');
    if (session.holderUserId !== Number(user.id) || !auth.token || digest(auth.token) !== session.tokenHash) throw fail('ASSET_LOCKED', 'Another edit session holds this asset.');
    if (checkRevision && (!/^(0|[1-9]\d*)$/.test(String(auth.revision)) || Number(auth.revision) !== asset.revision || session.baseRevision !== asset.revision)) throw fail('REVISION_CONFLICT', 'This asset changed. Review the latest content before submitting.');
    if (file && auth.baseContentVersionId !== asset.contentVersionId) throw fail('REVISION_CONFLICT', 'Your file is based on a different content version. Review the latest version first.');
    return { actor, session };
  }
  async function heartbeat(id, user, auth) {
    return lockedAsset(id, user, async (asset, _actor, transaction) => {
      const { session } = await validate(asset, user, auth, transaction, { checkRevision: false });
      const now = clock(); await session.update({ heartbeatAt: now, expiresAt: new Date(now.getTime() + LEASE_MS) }, { transaction });
      return { expiresAt: session.expiresAt };
    });
  }
  async function release(id, user, auth) {
    return lockedAsset(id, user, async (asset, actor, transaction) => {
      const session = await db.AssetEditSession.findOne({ where: { assetId: asset.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!session) return { released: true };
      if (session.holderUserId !== Number(user.id) || !auth.token || digest(auth.token) !== session.tokenHash) throw fail('ASSET_LOCKED', 'This is not your edit session.');
      await session.destroy({ transaction }); await event(asset, actor, 'lock.released', transaction);
      return { released: true };
    });
  }
  async function status(id, user) {
    return lockedAsset(id, user, async (asset, _actor, transaction) => {
      const session = await db.AssetEditSession.findOne({ where: { assetId: asset.id }, transaction });
      if (!session) return { locked: false, revision: asset.revision };
      if (new Date(session.expiresAt) <= clock()) {
        await session.destroy({ transaction });
        await event(asset, null, 'lock.expired', transaction, { holderUserId: session.holderUserId });
        return { locked: false, revision: asset.revision };
      }
      const holder = await db.User.findByPk(session.holderUserId, { transaction });
      return { locked: true, sessionId: session.id, holderUserId: session.holderUserId, holderName: holder?.username || 'Member', acquiredAt: session.acquiredAt, expiresAt: session.expiresAt, revision: asset.revision };
    }, false);
  }
  async function finish(asset, user, auth, transaction, action, before, { file = false, deletion = false, details, keepEditing = false } = {}) {
    const { actor, session } = await validate(asset, user, auth, transaction, { deletion, file });
    asset.revision += 1;
    if (file) { asset.baseContentVersionId = asset.contentVersionId; asset.contentVersionId = crypto.randomUUID(); asset.fileSubmittedBy = actor.id; asset.fileSubmittedAt = new Date(); }
    await asset.save({ transaction });
    const tags = (await asset.getTags({ transaction })).map(tag => tag.name).sort();
    const tagChanges = action === 'asset.tags_changed' && before?.tags ? { addedTags: tags.filter(tag => !before.tags.includes(tag)), removedTags: before.tags.filter(tag => !tags.includes(tag)) } : {};
    await audit.append({ workspaceId: asset.workspaceId, asset, actor, action, before, after: { displayName: asset.displayName, metadata: asset.metadata, tags, revision: asset.revision, contentVersionId: asset.contentVersionId }, details: { ...details, ...tagChanges } }, transaction);
    const result = { revision: asset.revision, contentVersionId: asset.contentVersionId };
    if (session && keepEditing) {
      await session.update({ baseRevision: asset.revision }, { transaction });
      result.editingSessionRetained = true;
    } else if (session) {
      await session.destroy({ transaction });
      await event(asset, actor, 'lock.released', transaction);
    }
    return result;
  }
  return { acquire, heartbeat, release, status, validate, finish, actorFor };
}
const service = () => createEditService(require('../models'));
async function guard(asset, req, transaction, options) {
  if (!enabled()) return;
  const auth = credentials(req);
  const { actor } = await service().validate(asset, req.user, auth, transaction, options);
  req.auditActor = actor;
  req.auditBefore = { displayName: asset.displayName, metadata: asset.metadata, tags: (await asset.getTags({ transaction })).map(tag => tag.name).sort(), revision: asset.revision, contentVersionId: asset.contentVersionId };
}
async function finish(asset, req, transaction, action, before, options) {
  if (enabled()) return service().finish(asset, req.user, credentials(req), transaction, action, before, options);
}
module.exports = { enabled, fail, LEASE_MS, digest, credentials, createEditService, service, guard, finish };
