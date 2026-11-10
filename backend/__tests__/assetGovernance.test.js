const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('sequelize');
const migration = require('../migrations/20261104000000-add-asset-governance');
const { buildEvent, sanitize, createAuditService } = require('../src/services/auditService');
const { WORKSPACE_ROLES } = require('../src/utils/roles');

const asset = { id: 7, workspaceId: 4, userId: 2, originalname: 'city.png' };
const manager = { id: 2, workspaceId: 4, teamRole: WORKSPACE_ROLES.MANAGER };
const owner = { id: 3, workspaceId: 4, teamRole: WORKSPACE_ROLES.OWNER };
const input = (action, actor = manager) => ({ workspaceId: 4, asset, actor, action });

test('personal tag regeneration stays in asset history; cross-member Owner changes reach Workspace', () => {
  assert.equal(buildEvent(input('asset.ai_requested')).visibilityClass, 'asset');
  assert.equal(buildEvent(input('asset.ai_requested', owner)).visibilityClass, 'workspace');
  assert.equal(buildEvent(input('asset.tags_changed', { ...owner, id: 2 })).visibilityClass, 'asset');
  assert.equal(buildEvent(input('asset.ai_completed', null)).visibilityClass, 'asset');
});
test('important asset events always reach Workspace; comments and locks stay in asset history', () => {
  for (const action of ['asset.uploaded', 'asset.version_uploaded', 'asset.download', 'asset.trashed', 'asset.objected_restored']) {
    assert.equal(buildEvent(input(action)).visibilityClass, 'workspace');
  }
  for (const action of ['comment.created', 'lock.acquired', 'lock.expired']) assert.equal(buildEvent(input(action)).visibilityClass, 'asset');
  for (const action of ['asset.viewed', 'asset.searched', 'vocabulary.updated', 'lock.heartbeat']) {
    assert.throws(() => buildEvent(input(action)), /Unsupported audit action/);
  }
});
test('role audit preserves the affected user and before/after roles', () => {
  const event = buildEvent({ workspaceId: 4, actor: owner, action: 'member.role_changed',
    before: { userId: 2, role: WORKSPACE_ROLES.MANAGER }, after: { userId: 2, role: WORKSPACE_ROLES.COLLABORATOR } });
  assert.equal(event.assetId, null);
  assert.equal(event.visibilityClass, 'workspace');
  assert.equal(event.before.role, WORKSPACE_ROLES.MANAGER);
  assert.equal(event.after.role, WORKSPACE_ROLES.COLLABORATOR);
  assert.equal(event.actorRole, WORKSPACE_ROLES.OWNER);
});
test('rejects mismatched workspace references and invalid identifiers', () => {
  assert.throws(() => buildEvent({ ...input('asset.tags_changed'), workspaceId: 9 }), /workspace mismatch/);
  assert.throws(() => buildEvent(input('asset.tags_changed', { ...manager, workspaceId: 9 })), /workspace mismatch/);
  for (const id of [null, true, 0, -1, 'bad', 1.3]) assert.throws(() => buildEvent({ ...input('asset.uploaded'), workspaceId: id }));
});
test('redacts secrets and signed links recursively; does not retain deleted comment text', () => {
  const value = sanitize({ tags: ['city'], metadata: { password: 'secret', lockToken: 'credential', inviteCode: 'secret', caption: 'hello', link: 'https://s3/file?X-Amz-Signature=secret' } });
  assert.deepEqual(value.tags, ['city']);
  assert.deepEqual(value.metadata, { caption: 'hello', link: '[redacted]' });
  const event = buildEvent({ ...input('comment.deleted'), before: { body: 'private' }, after: { body: 'private' }, details: { commentId: 9, body: 'private' } });
  assert.equal(event.before, null); assert.equal(event.after, null);
  assert.deepEqual(event.details, { commentId: 9 });
});
test('successful mutations require their transaction; read outcomes can be written separately', async () => {
  const writes = [];
  const service = createAuditService({ AuditEvent: { create: async (...args) => writes.push(args) } });
  await assert.rejects(service.append(input('asset.tags_changed')), /transaction/);
  const transaction = { id: 'tx' };
  await service.append(input('asset.tags_changed'), transaction);
  assert.equal(writes[0][1].transaction, transaction);
  await service.append({ ...input('asset.tags_changed'), result: 'denied' });
  await service.append({ ...input('asset.download'), result: 'requested' });
  assert.equal(writes.length, 3);
});
test('query enforces workspace and feed scope with bounded cursor pagination', async () => {
  const queries = [];
  const rows = [1, 2, 3].map(n => ({ id: `00000000-0000-4000-8000-00000000000${n}`, occurredAt: new Date('2026-11-04T00:00:00Z') }));
  const service = createAuditService({ Sequelize: S, AuditEvent: { findAll: async q => { queries.push(q); return rows; } } });
  const first = await service.list({ workspaceId: 4, limit: 2 });
  assert.equal(first.events.length, 2); assert.ok(first.nextCursor);
  assert.equal(queries[0].where.workspaceId, 4); assert.equal(queries[0].where.visibilityClass, 'workspace');
  await service.list({ workspaceId: 4, assetId: 7, cursor: first.nextCursor, limit: 9999 });
  assert.equal(queries[1].where.assetId, 7); assert.equal(queries[1].where.visibilityClass, undefined);
  assert.equal(queries[1].limit, 101); assert.ok(queries[1].where[S.Op.or]);
  await assert.rejects(service.list({ workspaceId: 4, cursor: 'broken' }), /Invalid cursor/);
});
test('migration is repeatable, additive and creates retention-safe tables without cascading asset FKs', async () => {
  for (const existing of [true, false]) {
    const tables = existing ? { Assets: { filename: { sentinel: true } }, Versions: { fileName: { sentinel: true } } } : {};
    const indexes = {};
    const q = {
      showAllTables: async () => Object.keys(tables), describeTable: async t => tables[t],
      addColumn: async (t, k, v) => { assert.equal(tables[t][k], undefined); tables[t][k] = v; },
      createTable: async (t, v) => { assert.equal(tables[t], undefined); tables[t] = v; },
      showIndex: async t => indexes[t] || [],
      addIndex: async (t, fields, options) => { (indexes[t] ||= []).push({ name: options.name, fields }); }
    };
    await migration.up(q, S); await migration.up(q, S);
    for (const name of ['AuditEvents', 'AssetEditSessions', 'AssetTrashCycles', 'Notifications', 'AssetPurgeJobs']) assert.ok(tables[name]);
    assert.equal(tables.AuditEvents.assetId.references, undefined);
    assert.equal(tables.AssetEditSessions.assetId.unique, true);
    assert.equal(tables.AssetPurgeJobs.cycleId.unique, true);
    assert.equal(indexes.AuditEvents.length, 2);
    if (existing) {
      assert.equal(tables.Assets.filename.sentinel, true);
      assert.equal(tables.Assets.lifecycleState.defaultValue, 'active');
      assert.equal(tables.Assets.revision.defaultValue, 0);
      assert.equal(tables.Versions.submittedBy.allowNull, undefined);
    }
  }
  await assert.rejects(migration.down(), /forward migration/);
});
test('models align with migration fields and load without a database connection', () => {
  const sequelize = new S.Sequelize('postgres://unused:unused@localhost/unused', { logging: false });
  for (const name of ['auditEvent', 'assetEditSession', 'assetTrashCycle', 'notification', 'assetPurgeJob']) {
    const model = require(`../src/models/${name}`)(sequelize, S.DataTypes);
    assert.equal(model.rawAttributes.id.primaryKey, true);
    assert.ok(!Object.values(model.rawAttributes).some(field => field.references));
  }
});
