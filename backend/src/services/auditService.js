'use strict';

const { randomUUID } = require('node:crypto');
const { WORKSPACE_ROLES } = require('../utils/roles');
const ACTIONS = Object.freeze({
  'workspace.created': 'workspace', 'workspace.renamed': 'workspace', 'workspace.invite_regenerated': 'workspace',
  'member.joined': 'workspace', 'member.removed': 'workspace', 'member.role_changed': 'workspace',
  'member.access_changed': 'workspace',
  'asset.uploaded': 'workspace', 'asset.snapshot_created': 'workspace', 'asset.version_uploaded': 'workspace',
  'asset.trashed': 'workspace', 'asset.restored': 'workspace', 'asset.objected_restored': 'workspace',
  'asset.purge_started': 'workspace', 'asset.purge_completed': 'workspace', 'asset.purge_failed': 'workspace',
  'asset.purge_paused': 'workspace', 'asset.purge_rescheduled': 'workspace',
  'asset.download': 'workspace', 'asset.renamed': 'content', 'asset.tags_changed': 'content',
  'asset.metadata_changed': 'content', 'asset.ai_requested': 'content', 'asset.ai_completed': 'content',
  'asset.ai_failed': 'content', 'asset.ai_reviewed': 'content',
  'asset.ai_suggestions_ready': 'content',
  'comment.created': 'asset', 'comment.updated': 'asset', 'comment.deleted': 'asset',
  'lock.acquired': 'asset', 'lock.released': 'asset', 'lock.expired': 'asset', 'lock.revoked': 'asset'
});
const SECRET = /password|passwd|secret|token|authorization|cookie|invite.?code|signed.?url|credential/i;
const RESULTS = new Set(['success', 'requested', 'completed', 'interrupted', 'failed', 'denied']);

function positiveId(value) {
  const n = typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(n) || n <= 0) throw new TypeError('A positive integer ID is required');
  return n;
}
function sanitize(value, depth = 0) {
  if (value == null || typeof value === 'boolean') return value;
  if (depth > 6) return '[omitted]';
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    // Download links and bearer credentials do not belong in permanent history.
    if (/bearer\s|[?&](?:x-amz-|signature=|token=)/i.test(value)) return '[redacted]';
    return value.slice(0, 2000);
  }
  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitize(item, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SECRET.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key))
    .slice(0, 100).map(([key, item]) => [key, sanitize(item, depth + 1)]));
  return null;
}
function buildEvent(input) {
  const category = ACTIONS[input.action];
  if (!category) throw new TypeError('Unsupported audit action');
  const workspaceId = positiveId(input.workspaceId);
  const asset = input.asset;
  if (asset && positiveId(asset.workspaceId) !== workspaceId) throw new TypeError('Asset workspace mismatch');
  const actor = input.actor;
  if (actor?.workspaceId && positiveId(actor.workspaceId) !== workspaceId) throw new TypeError('Actor workspace mismatch');
  const actorId = actor ? positiveId(actor.id) : null;
  const uploaderId = asset ? positiveId(asset.userId) : null;
  const crossMember = category === 'content' && asset && actor?.teamRole === WORKSPACE_ROLES.OWNER && actorId !== uploaderId;
  const result = input.result || 'success';
  if (!RESULTS.has(result)) throw new TypeError('Unsupported audit result');
  // Comment bodies are intentionally not retained after deletion or edit.
  const comment = input.action.startsWith('comment.');
  return {
    id: randomUUID(), workspaceId, assetId: asset ? positiveId(asset.id) : null,
    actorId, actorRole: actor?.teamRole || (actor ? actor.role : 'system'),
    actorName: actor ? String(actor.name || actor.username || actor.id).slice(0, 200) : 'System',
    initiatorId: input.initiatorId == null ? null : positiveId(input.initiatorId),
    uploaderId, targetName: sanitize(String(asset?.displayName || asset?.originalname || input.targetName || '')).slice(0, 200),
    action: input.action, result,
    visibilityClass: category === 'workspace' || crossMember ? 'workspace' : 'asset',
    before: comment ? null : sanitize(input.before ?? null), after: comment ? null : sanitize(input.after ?? null),
    details: sanitize(comment ? { commentId: input.details?.commentId } : input.details ?? null),
    correlationId: input.correlationId || null, requestId: input.requestId ? String(input.requestId).slice(0, 100) : null,
    schemaVersion: 1, occurredAt: new Date()
  };
}
function createAuditService(db) {
  return {
    async append(input, transaction) {
      const event = buildEvent(input);
      // Successful changes must be committed with their event, not logged after the fact.
      if (event.result === 'success' && event.action !== 'asset.download' && !transaction) {
        throw new TypeError('Successful mutations require an audit transaction');
      }
      return db.AuditEvent.create(event, { transaction });
    },
    async list({ workspaceId, assetId, cursor, limit = 30, action, actorId, actorName, targetName, scope, category, result, from, to }) {
      const { Op } = db.Sequelize;
      const where = { workspaceId: positiveId(workspaceId) };
      if (assetId != null) where.assetId = positiveId(assetId);
      if (scope === 'workspace' || assetId == null) where.visibilityClass = 'workspace';
      if (action) {
        if (!ACTIONS[action]) throw new TypeError('Unsupported audit action');
        where.action = action;
      }
      if (actorId != null) where.actorId = positiveId(actorId);
      if (actorName) {
        if (typeof actorName !== 'string' || actorName.length > 200) throw new TypeError('Invalid person filter');
        where.actorName = { [Op.iLike]: `%${actorName.replace(/[\\%_]/g, '\\$&')}%` };
      }
      if (targetName) {
        if (typeof targetName !== 'string' || targetName.length > 200) throw new TypeError('Invalid object filter');
        where.targetName = { [Op.iLike]: `%${targetName.replace(/[\\%_]/g, '\\$&')}%` };
      }
      if (category) {
        const categories = { workspace: ['workspace.', 'member.'], content: ['asset.renamed', 'asset.tags_changed', 'asset.metadata_changed', 'asset.ai_'], versions: ['asset.uploaded', 'asset.snapshot_created', 'asset.version_uploaded'], downloads: ['asset.download'], recycle: ['asset.trashed', 'asset.restored', 'asset.objected_restored', 'asset.purge_'], comments: ['comment.'], locks: ['lock.'] };
        if (!categories[category]) throw new TypeError('Invalid audit category');
        const actions = Object.keys(ACTIONS).filter(key => categories[category].some(prefix => key.startsWith(prefix)));
        if (action && !actions.includes(action)) return { events: [], nextCursor: null };
        if (!action) where.action = { [Op.in]: actions };
      }
      if (result) { if (!RESULTS.has(result)) throw new TypeError('Invalid audit result'); where.result = result; }
      if (from || to) {
        if ((from && !Number.isFinite(Date.parse(from))) || (to && !Number.isFinite(Date.parse(to))) || (from && to && Date.parse(from) > Date.parse(to))) throw new TypeError('Invalid date range');
        where.occurredAt = { ...(from ? { [Op.gte]: new Date(from) } : {}), ...(to ? { [Op.lte]: new Date(to) } : {}) };
      }
      if (cursor) {
        if (typeof cursor !== 'string' || cursor.length > 2048) throw new TypeError('Invalid cursor');
        let parsed;
        try { parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()); } catch { throw new TypeError('Invalid cursor'); }
        if (!parsed || !Number.isFinite(Date.parse(parsed.time)) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.id || '')) throw new TypeError('Invalid cursor');
        where[Op.or] = [{ occurredAt: { [Op.lt]: new Date(parsed.time) } },
          { occurredAt: new Date(parsed.time), id: { [Op.lt]: parsed.id } }];
      }
      const pageSize = Math.min(100, Math.max(1, Number(limit) || 30));
      const rows = await db.AuditEvent.findAll({ where, order: [['occurredAt', 'DESC'], ['id', 'DESC']], limit: Math.floor(pageSize) + 1 });
      const events = rows.slice(0, Math.floor(pageSize));
      const last = events[events.length - 1];
      return { events, nextCursor: rows.length > pageSize && last
        ? Buffer.from(JSON.stringify({ time: last.occurredAt, id: last.id })).toString('base64url') : null };
    }
  };
}

module.exports = { ACTIONS, buildEvent, sanitize, createAuditService };
