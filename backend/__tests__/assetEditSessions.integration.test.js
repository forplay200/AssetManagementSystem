const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const S = require('sequelize');
const { createEditService, LEASE_MS } = require('../src/services/assetEditSessions');
const migration = require('../migrations/20261104000000-add-asset-governance');
const recycleMigration = require('../migrations/20261104010000-add-recycle-bin-constraints');
const provenanceMigration = require('../migrations/20261104020000-add-current-file-provenance');
const { createLifecycleService, RETENTION_MS } = require('../src/services/assetLifecycle');
const { createPurgeService } = require('../src/services/assetPurgeJobs');
const url = process.env.TEST_GOVERNANCE_DATABASE_URL;
// This suite resets its database. Explicit opt-in and a dedicated local name are mandatory.
const safe = url && new URL(url);
if (safe && (!['localhost', '127.0.0.1'].includes(safe.hostname) || safe.pathname !== '/governance_test')) throw new Error('Governance integration tests require a dedicated local governance_test database.');
const db = { Sequelize: S };
let service, now, controller, downloadFailure = false, slowDownload = false;
const previousFlag = process.env.ASSET_GOVERNANCE_ENABLED;
const manager = { id: 2, workspaceId: 8 };
const owner = { id: 1, workspaceId: 8 };
const auth = session => ({ token: session.token, revision: String(session.revision), baseContentVersionId: session.baseContentVersionId });
before(async () => {
  if (!url) return;
  db.sequelize = new S.Sequelize(url, { logging: false, pool: { max: 8 } });
  for (const file of require('node:fs').readdirSync(require('node:path').join(__dirname, '../src/models')).filter(file => file.endsWith('.js') && file !== 'index.js')) {
    const model = require(`../src/models/${file}`)(db.sequelize, S.DataTypes); db[model.name] = model;
  }
  for (const model of Object.values(db)) if (model.associate) model.associate(db);
  await db.sequelize.sync({ force: true });
  const q = db.sequelize.getQueryInterface();
  // Exercise a legacy schema, actual table creation, repeat migration, then startup sync.
  for (const table of ['AuditEvents', 'AssetEditSessions', 'AssetTrashCycles', 'Notifications', 'AssetPurgeJobs']) await q.dropTable(table);
  for (const column of ['lifecycleState', 'revision', 'contentVersionId', 'aiRequestContext', 'pendingAiResult']) await q.removeColumn('Assets', column);
  for (const column of ['fileSubmittedBy', 'fileSubmittedAt', 'baseContentVersionId']) await q.removeColumn('Assets', column);
  for (const column of ['contentVersionId', 'baseContentVersionId', 'submittedBy', 'submittedAt']) await q.removeColumn('Versions', column);
  await migration.up(q, S); await migration.up(q, S); await provenanceMigration.up(q, S); await provenanceMigration.up(q, S); await db.sequelize.sync({ alter: true });
  await recycleMigration.up(q, S); await recycleMigration.up(q, S); await db.sequelize.sync({ alter: true });
  const mock = (name, exports) => { const id = require.resolve(name); require.cache[id] = { id, filename: id, loaded: true, exports }; };
  mock('../src/models', db);
  mock('../src/redisClient', { lPush: async () => {} });
  mock('../src/utils/minioClient', { minioClient: {
    async getObject(_bucket, key) {
      if (downloadFailure) throw new Error('Storage unavailable');
      if (slowDownload) {
        let timer;
        const stream = new (require('node:stream').Readable)({ read() { if (!timer) timer = setTimeout(() => { timer = null; this.push(Buffer.alloc(8192)); }, 20); } });
        stream.once('close', () => clearTimeout(timer)); return stream;
      }
      return require('node:stream').Readable.from([Buffer.from(`test:${key}`)]);
    },
    async fPutObject() {}, async copyObject() {}, async removeObject() {}
  }, BUCKET_NAME: 'unused-test-bucket' });
  mock('../src/utils/logger', { error() {}, info() {} });
  process.env.ASSET_GOVERNANCE_ENABLED = 'true';
  controller = require('../src/controllers/assetsController');
});
after(async () => { if (db.sequelize) await db.sequelize.close(); if (previousFlag === undefined) delete process.env.ASSET_GOVERNANCE_ENABLED; else process.env.ASSET_GOVERNANCE_ENABLED = previousFlag; });
beforeEach(async () => {
  if (!url) return;
  await db.sequelize.truncate({ cascade: true, restartIdentity: true });
  await db.User.bulkCreate([1, 2, 3].map(id => ({ id, username: `user${id}`, email: `${id}@example.test`, passwordHash: 'unused', role: 'user', isActive: true })));
  await db.Team.create({ id: 8, name: 'Studio', inviteCode: 'TESTONLY', createdBy: 1 });
  await db.TeamMember.bulkCreate([{ teamId: 8, userId: 1, role: 'workspaceOwner' }, { teamId: 8, userId: 2, role: 'workspaceManager' }, { teamId: 8, userId: 3, role: 'collaborator' }]);
  await db.Asset.create({ id: 7, userId: 2, workspaceId: 8, filename: 'old.txt', originalname: 'old.txt', mimetype: 'text/plain', size: 10, path: 'old.txt' });
  now = new Date(); service = createEditService(db, () => now);
  downloadFailure = false;
  slowDownload = false;
});
const integration = (name, fn) => test(name, { skip: !url && 'Set TEST_GOVERNANCE_DATABASE_URL to run isolated PostgreSQL tests.' }, fn);

integration('PostgreSQL serializes simultaneous acquisitions; only one session succeeds', async () => {
  const results = await Promise.allSettled([service.acquire(7, manager), service.acquire(7, owner)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'ASSET_LOCKED');
  assert.equal(await db.AssetEditSession.count(), 1);
  assert.equal(await db.AuditEvent.count({ where: { action: 'lock.acquired' } }), 1);
});
integration('same account in a second tab cannot acquire or release another session; status hides credentials', async () => {
  const session = await service.acquire(7, manager);
  await assert.rejects(service.acquire(7, manager), e => e.code === 'ASSET_LOCKED');
  await assert.rejects(service.release(7, manager, { token: 'wrong' }), e => e.code === 'ASSET_LOCKED');
  const status = await service.status(7, owner);
  assert.equal(status.holderName, 'user2'); assert.equal(status.token, undefined); assert.equal(status.tokenHash, undefined);
  const stored = await db.AssetEditSession.findOne(); assert.notEqual(stored.tokenHash, session.token);
});
integration('heartbeat extends lease; exact expiry invalidates token and a new lease never revives it', async () => {
  const first = await service.acquire(7, manager);
  now = new Date(now.getTime() + LEASE_MS - 1);
  await service.heartbeat(7, manager, auth(first));
  now = new Date(now.getTime() + LEASE_MS);
  await assert.rejects(service.heartbeat(7, manager, auth(first)), e => e.code === 'LOCK_EXPIRED');
  const next = await service.acquire(7, owner); assert.notEqual(first.token, next.token);
  await assert.rejects(service.release(7, manager, auth(first)), e => e.code === 'ASSET_LOCKED');
  assert.equal(await db.AuditEvent.count({ where: { action: 'lock.expired' } }), 1);
});
integration('successful edit increments revision and atomically releases the lock with audit', async () => {
  const session = await service.acquire(7, manager);
  await db.sequelize.transaction(async transaction => {
    const asset = await db.Asset.findByPk(7, { transaction, lock: transaction.LOCK.UPDATE });
    await service.validate(asset, manager, auth(session), transaction);
    asset.displayName = 'Updated';
    await service.finish(asset, manager, auth(session), transaction, 'asset.renamed', { displayName: null });
  });
  assert.equal((await db.Asset.findByPk(7)).revision, 1); assert.equal(await db.AssetEditSession.count(), 0);
  assert.equal(await db.AuditEvent.count({ where: { action: 'asset.renamed', visibilityClass: 'asset' } }), 1);
});
integration('old revisions and old file origins are rejected after a new file version', async () => {
  const old = await service.acquire(7, manager);
  now = new Date(now.getTime() + LEASE_MS);
  const newer = await service.acquire(7, owner);
  await db.sequelize.transaction(async transaction => {
    const asset = await db.Asset.findByPk(7, { transaction, lock: transaction.LOCK.UPDATE });
    asset.filename = 'new.txt';
    await service.finish(asset, owner, auth(newer), transaction, 'asset.version_uploaded', {}, { file: true });
  });
  const fresh = await service.acquire(7, manager);
  await db.sequelize.transaction(async transaction => {
    const asset = await db.Asset.findByPk(7, { transaction, lock: transaction.LOCK.UPDATE });
    await assert.rejects(service.validate(asset, manager, { ...auth(fresh), revision: old.revision }, transaction), e => e.code === 'REVISION_CONFLICT');
    await assert.rejects(service.validate(asset, manager, { ...auth(fresh), baseContentVersionId: old.baseContentVersionId }, transaction, { file: true }), e => e.code === 'REVISION_CONFLICT');
  });
});
integration('role downgrade invalidates renewal and lets Owner revoke the old holder', async () => {
  const session = await service.acquire(7, manager);
  await db.TeamMember.update({ role: 'collaborator' }, { where: { teamId: 8, userId: 2 } });
  await assert.rejects(service.heartbeat(7, manager, auth(session)), e => e.code === 'PERMISSION_CHANGED');
  await service.acquire(7, owner);
  assert.equal(await db.AuditEvent.count({ where: { action: 'lock.revoked' } }), 1);
});
integration('inactive accounts, removed members, collaborators and wrong workspaces cannot acquire', async () => {
  await assert.rejects(service.acquire(7, { id: 3, workspaceId: 8 }), e => e.status === 403);
  await assert.rejects(service.acquire(7, { id: 2, workspaceId: 9 }), e => e.status === 404);
  await db.User.update({ isActive: false }, { where: { id: 2 } });
  await assert.rejects(service.acquire(7, manager), e => e.status === 403);
  await db.TeamMember.destroy({ where: { userId: 1 } });
  await assert.rejects(service.acquire(7, owner), e => e.status === 403);
});
integration('trash and deletion validation prevent bypassing another active edit', async () => {
  await service.acquire(7, manager);
  await db.sequelize.transaction(async transaction => {
    const asset = await db.Asset.findByPk(7, { transaction, lock: transaction.LOCK.UPDATE });
    await assert.rejects(service.validate(asset, owner, {}, transaction, { deletion: true }), e => e.code === 'ASSET_LOCKED');
  });
  await db.Asset.update({ lifecycleState: 'trashed' }, { where: { id: 7 } });
  await assert.rejects(service.acquire(7, owner), e => e.code === 'ASSET_TRASHED');
});
integration('audit failure rolls back content changes and retains the editing lease', async () => {
  const session = await service.acquire(7, manager);
  const original = db.AuditEvent.create;
  db.AuditEvent.create = async () => { throw new Error('audit unavailable'); };
  try {
    await assert.rejects(db.sequelize.transaction(async transaction => {
      const asset = await db.Asset.findByPk(7, { transaction, lock: transaction.LOCK.UPDATE });
      asset.displayName = 'Must rollback';
      await service.finish(asset, manager, auth(session), transaction, 'asset.renamed', {});
    }), /audit unavailable/);
  } finally { db.AuditEvent.create = original; }
  const asset = await db.Asset.findByPk(7);
  assert.equal(asset.displayName, null); assert.equal(asset.revision, 0); assert.equal(await db.AssetEditSession.count(), 1);
});

function request(body, session, user = { ...manager, teamRole: 'workspaceManager' }) {
  const headers = session ? { 'X-Asset-Edit-Token': session.token, 'X-Asset-Revision': String(session.revision), 'X-Asset-Base-Version': session.baseContentVersionId } : {};
  return { params: { id: 7 }, user, body, get: name => headers[name] };
}
function response() { return { statusCode: 200, removeHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
integration('actual metadata controller rejects missing or wrong-session credentials and commits a valid edit', async () => {
  let res = response(); await controller.updateAssetMetadata(request({ metadata: { title: 'blocked' } }), res);
  assert.equal(res.statusCode, 409); assert.equal(res.body.code, 'LOCK_EXPIRED');
  const session = await service.acquire(7, manager);
  res = response(); await controller.updateAssetMetadata(request({ metadata: { title: 'blocked' } }, { ...session, token: 'invalid' }), res);
  assert.equal(res.body.code, 'ASSET_LOCKED');
  res = response(); await controller.updateAssetMetadata(request({ metadata: { title: 'saved' } }, session), res);
  assert.equal(res.statusCode, 200); assert.equal((await db.Asset.findByPk(7)).metadata.title, 'saved');
  assert.equal(await db.AssetEditSession.count(), 0);
});
integration('actual rename controller cannot silently overwrite after permission loss', async () => {
  const session = await service.acquire(7, manager);
  await db.TeamMember.update({ role: 'collaborator' }, { where: { teamId: 8, userId: 2 } });
  const res = response(); await controller.renameAsset(request({ displayName: 'blocked' }, session), res);
  assert.equal(res.statusCode, 403); assert.equal((await db.Asset.findByPk(7)).displayName, null);
});
integration('AI callback during editing only stages suggestions; applying them requires the valid edit session', async () => {
  await db.Asset.update({ metadata: { title: 'keep', ai: { keywords: ['old'] } }, aiRequestContext: { id: 'job-one', filename: 'old.txt', revision: 0 } }, { where: { id: 7 } });
  const session = await service.acquire(7, manager);
  const callback = request({ metadata: { ai: { keywords: ['new'] }, title: 'must not replace' } }); callback.get = () => 'job-one';
  const staged = response(); await controller.storeAiResult(callback, staged);
  assert.equal(staged.statusCode, 200);
  let asset = await db.Asset.findByPk(7);
  assert.deepEqual(asset.metadata.ai.keywords, ['old']); assert.deepEqual(asset.pendingAiResult.metadata.ai.keywords, ['new']);
  const denied = response(); await controller.applyAiSuggestions(request({}), denied); assert.equal(denied.statusCode, 409);
  const saved = response(); await controller.applyAiSuggestions(request({}, session), saved); assert.equal(saved.statusCode, 200);
  asset = await db.Asset.findByPk(7);
  assert.equal(asset.metadata.title, 'keep'); assert.deepEqual(asset.metadata.ai.keywords, ['new']); assert.equal(asset.pendingAiResult, null);
});
integration('AI callbacks without the current request identity cannot overwrite newer edits', async () => {
  await db.Asset.update({ aiRequestContext: { id: 'current-job', filename: 'old.txt', revision: 0 } }, { where: { id: 7 } });
  const callback = request({ metadata: { ai: { keywords: ['stale'] } } }); callback.get = () => 'previous-job';
  const rejected = response(); await controller.storeAiResult(callback, rejected); assert.equal(rejected.body.code, 'REVISION_CONFLICT');
  const session = await service.acquire(7, manager);
  const saved = response(); await controller.updateAssetMetadata(request({ metadata: { title: 'new' } }, session), saved);
  callback.get = () => 'current-job';
  const late = response(); await controller.storeAiResult(callback, late); assert.equal(late.body.code, 'REVISION_CONFLICT');
  assert.equal((await db.Asset.findByPk(7)).metadata.title, 'new');
});
integration('individual AI suggestions are accepted, edited and removed within one editing lease', async () => {
  const createdAt = new Date().toISOString();
  await db.Asset.update({
    pendingAiResult: { createdAt, filename: 'old.txt', revision: 0, metadata: { ai: { keywords: ['shield', 'texture', 'dialog box'] } } }
  }, { where: { id: 7 } });
  const call = async (handler, body, session) => {
    const req = request(body, session);
    req.params.assetId = 7;
    const res = response();
    await handler(req, res);
    return res;
  };

  let session = await service.acquire(7, manager);
  const initial = session;
  const accept = (tag, suggestionCreatedAt) => call(controller.addTagToAsset, { tag, suggestionCreatedAt, keepEditing: true }, session);
  assert.equal((await accept('shield', 'old-result')).body.code, 'AI_SUGGESTION_OUTDATED');
  let saved = await accept('shield', createdAt);
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.editingSessionRetained, true);
  let asset = await db.Asset.findByPk(7);
  assert.deepEqual((await asset.getTags()).map(tag => tag.name), ['shield']);
  assert.equal(asset.pendingAiResult.revision, asset.revision);
  assert.deepEqual(asset.pendingAiResult.metadata.ai.keywords, ['texture', 'dialog box']);
  assert.equal(asset.metadata?.ai, undefined);
  assert.equal((await service.status(7, manager)).sessionId, initial.sessionId);
  await assert.rejects(service.acquire(7, owner), error => error.code === 'ASSET_LOCKED');
  await service.heartbeat(7, manager, auth(initial));

  session = { ...session, revision: saved.body.revision };
  saved = await call(controller.updateAiSuggestion, { tag: 'texture', suggestionCreatedAt: createdAt, replacement: 'stone texture' }, session);
  assert.equal(saved.statusCode, 200);
  session = { ...session, revision: saved.body.revision };
  saved = await call(controller.updateAiSuggestion, { tag: 'dialog box', suggestionCreatedAt: createdAt, replacement: null }, session);
  assert.equal(saved.statusCode, 200);
  session = { ...session, revision: saved.body.revision };
  asset = await db.Asset.findByPk(7);
  assert.deepEqual(asset.pendingAiResult.metadata.ai.keywords, ['stone texture']);
  assert.deepEqual((await asset.getTags()).map(tag => tag.name), ['shield']);

  saved = await call(controller.removeTagFromAsset, { tag: 'shield', keepEditing: true }, session);
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.editingSessionRetained, true);
  assert.deepEqual((await asset.getTags()).map(tag => tag.name), []);
  await service.release(7, manager, auth(session));
  assert.equal(await db.AssetEditSession.count(), 0);
});
integration('governance deletion uses recycle-bin state and keeps the physical asset record', async () => {
  const res = response(); await controller.deleteAsset(request({}), res);
  assert.equal(res.statusCode, 200); assert.ok(res.body.cycle);
  assert.equal((await db.Asset.findByPk(7)).lifecycleState, 'trashed');
});

const lifecycle = () => createLifecycleService(db, () => now);
function purgeFixture(failKey) {
  const removed = [];
  const storage = { listKeys: async () => [], remove: async key => { if (key === failKey) throw new Error('simulated storage outage'); removed.push(key); } };
  return { removed, storage, service: createPurgeService(db, storage, () => now) };
}
integration('trash transaction creates a seven-day cycle and persistent notification without deleting versions or comments', async () => {
  await db.Version.create({ assetId: 7, versionNumber: 1, fileName: 'version.txt', originalName: 'v1.txt', mimeType: 'text/plain', size: 2 });
  await db.Comment.create({ assetId: 7, userId: 2, content: 'keep me' });
  const cycle = await lifecycle().trash(7, owner, {}, 'Duplicate');
  assert.equal(new Date(cycle.purgeAfter) - new Date(cycle.deletedAt), RETENTION_MS);
  assert.equal(await db.Version.count(), 1); assert.equal(await db.Comment.count(), 1);
  const notice = await db.Notification.findOne(); assert.equal(notice.recipientId, 2); assert.equal(notice.cycleId, cycle.id);
  assert.equal(await db.AuditEvent.count({ where: { action: 'asset.trashed' } }), 1);
});
integration('notification failure rolls back trash state and preserves the existing lease', async () => {
  const session = await service.acquire(7, manager);
  const original = db.Notification.create; db.Notification.create = async () => { throw new Error('notification unavailable'); };
  try { await assert.rejects(lifecycle().trash(7, manager, auth(session)), /notification unavailable/); }
  finally { db.Notification.create = original; }
  assert.equal((await db.Asset.findByPk(7)).lifecycleState, 'active');
  assert.equal(await db.AssetTrashCycle.count(), 0); assert.equal(await db.AssetEditSession.count(), 1);
});
integration('deletion cannot bypass another session and Owner must give a reason for someone else’s asset', async () => {
  await assert.rejects(lifecycle().trash(7, owner), e => e.code === 'REASON_REQUIRED');
  const session = await service.acquire(7, manager);
  await assert.rejects(lifecycle().trash(7, owner, {}, 'Remove'), e => e.code === 'ASSET_LOCKED');
  await lifecycle().trash(7, manager, auth(session)); assert.equal(await db.AssetEditSession.count(), 0);
});
integration('uploader objection restores immediately even after downgrade; a new deletion has a new protected cycle', async () => {
  const first = await lifecycle().trash(7, owner, {}, 'Duplicate');
  await db.TeamMember.update({ role: 'collaborator' }, { where: { userId: 2 } });
  await lifecycle().restore(7, first.id, manager, true, 'Keep this');
  assert.equal((await db.Asset.findByPk(7)).lifecycleState, 'active');
  assert.equal((await db.Asset.findByPk(7)).userId, 2);
  now = new Date(now.getTime() + 1000);
  const second = await lifecycle().trash(7, owner, {}, 'Duplicate again');
  assert.notEqual(first.id, second.id); assert.ok(second.purgeAfter > first.purgeAfter);
  await assert.rejects(lifecycle().restore(7, first.id, manager, true), e => e.code === 'PURGE_STARTED');
  assert.equal(await purgeFixture().service.claim(first.id), null);
  assert.equal((await db.Asset.findByPk(7)).lifecycleState, 'trashed');
});
integration('recycle list and notifications remain isolated; downgraded uploader gets objection but no normal restore', async () => {
  const cycle = await lifecycle().trash(7, owner, {}, 'Duplicate');
  await db.TeamMember.update({ role: 'collaborator' }, { where: { userId: 2 } });
  const own = await lifecycle().list(manager);
  assert.equal(own.cycles[0].canObject, true); assert.equal(own.cycles[0].canRestore, false);
  assert.equal((await lifecycle().list({ id: 3, workspaceId: 8 })).cycles.length, 0);
  await assert.rejects(lifecycle().list({ id: 2, workspaceId: 9 }), e => [403, 404].includes(e.status));
  const notice = await db.Notification.findOne();
  await lifecycle().markRead(notice.id, owner); assert.equal((await db.Notification.findByPk(notice.id)).readAt, null);
  await lifecycle().markRead(notice.id, manager); assert.ok((await db.Notification.findByPk(notice.id)).readAt);
  await assert.rejects(lifecycle().restore(7, cycle.id, { id: 3, workspaceId: 8 }, true), e => e.status === 403);
});
integration('expired cycles cannot be recovered; cleanup claims never run early or while purge switch is disabled', async () => {
  const cycle = await lifecycle().trash(7, manager); const purge = purgeFixture();
  assert.equal(await purge.service.claim(cycle.id), null);
  now = new Date(now.getTime() + RETENTION_MS);
  assert.equal(await purge.service.claim(cycle.id, { allowPurge: false }), null);
  await assert.rejects(lifecycle().restore(7, cycle.id, manager), e => e.code === 'RETENTION_EXPIRED');
  const claimed = await purge.service.claim(cycle.id); assert.ok(claimed);
  await assert.rejects(lifecycle().restore(7, cycle.id, owner), e => e.code === 'PURGE_STARTED');
});
integration('unavailable uploader pauses cleanup; return creates a fresh seven-day notice', async () => {
  const cycle = await lifecycle().trash(7, manager);
  now = new Date(now.getTime() + RETENTION_MS);
  await db.User.update({ isActive: false }, { where: { id: 2 } });
  const purge = purgeFixture(); assert.equal(await purge.service.claim(cycle.id), null);
  assert.equal((await db.AssetTrashCycle.findByPk(cycle.id)).holdReason, 'UPLOADER_UNAVAILABLE');
  await db.User.update({ isActive: true }, { where: { id: 2 } });
  assert.equal(await purge.service.claim(cycle.id), null);
  const renewed = await db.AssetTrashCycle.findByPk(cycle.id);
  assert.equal(new Date(renewed.purgeAfter) - now, RETENTION_MS); assert.equal(renewed.holdReason, null);
  assert.equal(await db.Notification.count({ where: { recipientId: 2 } }), 2);
});
integration('permanent cleanup removes all manifest objects and relations while preserving logs and shared vocabulary tags', async () => {
  await db.Asset.update({ packageManifest: { files: [{ objectKey: 'old.txt' }, { objectKey: 'texture.png' }] } }, { where: { id: 7 } });
  await db.Version.create({ assetId: 7, versionNumber: 1, fileName: 'history.obj', originalName: 'history.obj', mimeType: 'model/obj', size: 2, packageManifest: { files: [{ objectKey: 'history.obj' }, { objectKey: 'history.mtl' }] } });
  const tag = await db.Tag.create({ name: 'keep-shared-tag' }); await (await db.Asset.findByPk(7)).addTag(tag);
  await db.Comment.create({ assetId: 7, userId: 2, content: 'comment' });
  await db.AssetAiJob.create({ id: '11111111-1111-4111-8111-111111111111', assetId: 7, workspaceId: 8, sourceFilename: 'old.txt', status: 'succeeded', input: {}, output: { frames: [{ key: 'video-jobs/frame.jpg' }] } });
  const cycle = await lifecycle().trash(7, manager); now = new Date(now.getTime() + RETENTION_MS);
  const purge = purgeFixture(); purge.storage.listKeys = async () => ['video-jobs/abandoned.jpg'];
  assert.equal(await purge.service.run(await purge.service.claim(cycle.id)), true);
  assert.deepEqual(new Set(purge.removed), new Set(['old.txt', 'texture.png', 'history.obj', 'history.mtl', 'video-jobs/frame.jpg', 'video-jobs/abandoned.jpg']));
  assert.equal(await db.Asset.findByPk(7), null); assert.equal(await db.Version.count(), 0); assert.equal(await db.Comment.count(), 0);
  assert.equal(await db.Tag.count(), 1); assert.equal((await db.AssetTrashCycle.findByPk(cycle.id)).status, 'purged');
  assert.equal(await db.AuditEvent.count({ where: { action: 'asset.purge_completed' } }), 1);
});
integration('storage failures retain retry state; repeated workers cannot write duplicate completion', async () => {
  const cycle = await lifecycle().trash(7, manager); now = new Date(now.getTime() + RETENTION_MS);
  const broken = purgeFixture('old.txt'); const claim = await broken.service.claim(cycle.id);
  assert.equal(await broken.service.run(claim), false);
  const job = await db.AssetPurgeJob.findOne(); assert.equal(job.status, 'failed'); assert.ok(job.nextAttemptAt);
  assert.ok(await db.Asset.findByPk(7)); assert.equal(await db.AuditEvent.count({ where: { action: 'asset.purge_completed' } }), 0);
  assert.equal(await broken.service.claim(cycle.id), null);
  now = new Date(now.getTime() + 300000); const healthy = purgeFixture();
  const claims = await Promise.all([healthy.service.claim(cycle.id), healthy.service.claim(cycle.id)]);
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(await healthy.service.run(claims.find(Boolean)), true); assert.equal(await healthy.service.run(claims.find(Boolean)), false);
  assert.equal(await db.AuditEvent.count({ where: { action: 'asset.purge_completed' } }), 1);
});
integration('object-listing failure before cleanup is visible and can retry without duplicate jobs', async () => {
  await db.AssetAiJob.create({ id: '11111111-1111-4111-8111-111111111111', assetId: 7, workspaceId: 8, sourceFilename: 'old.txt', status: 'cancelled', input: {} });
  const cycle = await lifecycle().trash(7, manager); now = new Date(now.getTime() + RETENTION_MS);
  const failed = purgeFixture(); failed.storage.listKeys = async () => { throw new Error('list unavailable'); };
  await assert.rejects(failed.service.claim(cycle.id), /list unavailable/);
  assert.equal((await db.AssetPurgeJob.findOne()).status, 'failed');
  assert.equal((await lifecycle().list(owner)).cycles[0].cleanup.status, 'failed');
  assert.equal((await db.Asset.findByPk(7)).lifecycleState, 'trashed');
  now = new Date(now.getTime() + 300000);
  const healthy = purgeFixture(); assert.equal(await healthy.service.run(await healthy.service.claim(cycle.id)), true);
  assert.equal(await db.AssetPurgeJob.count(), 1);
});
integration('objects referenced by another active asset or its historical package are retained', async () => {
  await db.Asset.create({ id: 9, userId: 2, workspaceId: 8, filename: 'shared.txt', originalname: 'shared.txt', mimetype: 'text/plain', size: 1, path: 'shared.txt' });
  await db.Version.create({ assetId: 9, versionNumber: 1, fileName: 'other.obj', originalName: 'other.obj', mimeType: 'model/obj', size: 1, packageManifest: { files: [{ objectKey: 'old.txt' }] } });
  const cycle = await lifecycle().trash(7, manager); now = new Date(now.getTime() + RETENTION_MS);
  const purge = purgeFixture(); await purge.service.run(await purge.service.claim(cycle.id));
  assert.deepEqual(purge.removed, []); assert.ok(await db.Asset.findByPk(9));
});
integration('recovery at the deadline and cleanup claim serialize to one lifecycle outcome', async () => {
  const cycle = await lifecycle().trash(7, manager); const before = new Date(now.getTime() + RETENTION_MS - 1);
  const recovery = createLifecycleService(db, () => before); now = new Date(before.getTime() + 1);
  const results = await Promise.allSettled([recovery.restore(7, cycle.id, manager, true), purgeFixture().service.claim(cycle.id)]);
  const state = (await db.Asset.findByPk(7)).lifecycleState;
  assert.ok(['active', 'purging'].includes(state));
  if (state === 'active') { assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].value, null); }
  else { assert.equal(results[0].status, 'rejected'); assert.ok(results[1].value); }
});
integration('comment mutation and ordinary access are blocked for trashed assets', async () => {
  const comment = await db.Comment.create({ assetId: 7, userId: 2, content: 'before' });
  await lifecycle().trash(7, manager);
  const commentsController = require('../src/controllers/commentsController');
  const res = response(); await commentsController.updateComment({ ...request({ content: 'after' }), params: { id: comment.id } }, res);
  assert.equal(res.statusCode, 410); assert.equal((await db.Comment.findByPk(comment.id)).content, 'before');
  const accessRes = response(); let called = false;
  await require('../src/middleware/workspaceAssetAccess')({ ...request({}), params: { id: 7 } }, accessRes, () => { called = true; });
  assert.equal(called, false); assert.equal(accessRes.statusCode, 410);
  const info = response(); await controller.getAssetInfo({ params: { id: 7 } }, info); assert.equal(info.statusCode, 410);
});
integration('member removal pauses their deletion cycles in the same transaction', async () => {
  const cycle = await lifecycle().trash(7, manager);
  const teamController = require('../src/controllers/teamController');
  const res = response(); await teamController.removeMember({ params: { userId: 2 }, user: { ...owner, teamId: 8, teamRole: 'workspaceOwner' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal((await db.AssetTrashCycle.findByPk(cycle.id)).holdReason, 'UPLOADER_UNAVAILABLE');
});
integration('expired cleanup leases cannot delete after a replacement worker claims the job', async () => {
  const cycle = await lifecycle().trash(7, manager); now = new Date(now.getTime() + RETENTION_MS);
  const purge = purgeFixture(); const first = await purge.service.claim(cycle.id);
  now = new Date(now.getTime() + 120000);
  const next = await purge.service.claim(cycle.id);
  assert.notEqual(first.token, next.token);
  assert.equal(await purge.service.run(first), false); assert.deepEqual(purge.removed, []);
  assert.equal(await purge.service.run(next), true);
});
integration('database constraints prevent duplicate open deletion cycles and duplicate recipient notifications', async () => {
  const cycle = await lifecycle().trash(7, manager);
  const duplicate = { ...cycle.toJSON(), id: require('node:crypto').randomUUID() };
  await assert.rejects(db.AssetTrashCycle.create(duplicate), e => e.name === 'SequelizeUniqueConstraintError');
  const notice = await db.Notification.findOne();
  await assert.rejects(db.Notification.create({ ...notice.toJSON(), id: require('node:crypto').randomUUID() }), e => e.name === 'SequelizeUniqueConstraintError');
});
integration('HTTP reads and AI callbacks cannot bypass recycle-bin access restrictions', async () => {
  await db.Asset.update({ packageManifest: { files: [{ id: 'main', objectKey: 'old.txt', mime: 'text/plain', path: 'old.txt' }] } }, { where: { id: 7 } });
  const cycle = await lifecycle().trash(7, manager);
  const express = require('express'); const app = express(); app.use(express.json()); app.use('/api/assets', require('../src/routes/assets'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const token = require('jsonwebtoken').sign({ id: 2, workspaceId: 8 }, process.env.JWT_SECRET || 'your_secret_key');
  const base = `http://127.0.0.1:${server.address().port}/api/assets`;
  try {
    for (const path of ['/7/details', '/7/metadata', '/7/tags', '/7/versions', '/7/versions/1/download', '/7/resources/main', '/preview/7', '/download/7', '/7/comments', '/7/ai-jobs/current']) {
      const result = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(result.status, 410, path);
    }
    const preview = `/7/recycle-bin/${cycle.id}`;
    const request = (path, id, workspaceId = 8) => fetch(base + path, { headers: {
      Authorization: `Bearer ${require('jsonwebtoken').sign({ id, workspaceId }, process.env.JWT_SECRET || 'your_secret_key')}`
    } });
    assert.equal((await request(preview + '/preview', 3)).status, 404);
    assert.equal((await request(preview + '/package', 3)).status, 404);
    assert.equal((await request(preview + '/resources/main', 3)).status, 404);
    await db.Team.create({ id: 9, name: 'Other workspace', inviteCode: 'TESTOTHER', createdBy: 3 });
    await db.TeamMember.create({ teamId: 9, userId: 3, role: 'workspaceOwner' });
    assert.equal((await request(preview + '/preview', 3, 9)).status, 404);
    assert.equal(await (await request(preview + '/preview', 2)).text(), 'test:old.txt');
    assert.equal(await (await request(preview + '/preview', 1)).text(), 'test:old.txt');
    const manifest = (await (await request(preview + '/package', 2)).json()).package;
    assert.equal(manifest.files[0].id, 'main');
    assert.equal(manifest.files[0].objectKey, undefined);
    assert.equal(await (await request(preview + '/resources/main', 2)).text(), 'test:old.txt');
    await lifecycle().restore(7, cycle.id, manager);
    assert.equal((await request(preview + '/preview', 2)).status, 404);
    const next = await lifecycle().trash(7, manager);
    assert.notEqual(next.id, cycle.id);
    assert.equal((await request(preview + '/preview', 2)).status, 404);
    now = new Date(now.getTime() + RETENTION_MS);
    assert.ok(await purgeFixture().service.claim(next.id));
    assert.equal((await request(`/7/recycle-bin/${next.id}/preview`, 2)).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
integration('self-deleted assets show Restore only and reject direct objections', async () => {
  await db.Asset.update({ userId: 1 }, { where: { id: 7 } });
  const cycle = await lifecycle().trash(7, owner);
  const { cycles: [entry] } = await lifecycle().list(owner);
  assert.equal(entry.canRestore, true);
  assert.equal(entry.canObject, false);
  assert.equal(entry.preview.originalname, 'old.txt');
  await assert.rejects(lifecycle().restore(7, cycle.id, owner, true), e => e.status === 403);
  await lifecycle().restore(7, cycle.id, owner);
  assert.equal(await db.AuditEvent.count({ where: { action: 'asset.restored' } }), 1);
  assert.equal(await db.AuditEvent.count({ where: { action: 'asset.objected_restored' } }), 0);
});
integration('real MinIO keeps objects through restore, then removes owned current, historical and video resources', async t => {
  const port = Number(process.env.TEST_GOVERNANCE_MINIO_PORT);
  if (!port) { t.skip('Set TEST_GOVERNANCE_MINIO_PORT for the isolated MinIO test.'); return; }
  if (port !== 19039) throw new Error('This test only supports the dedicated MinIO port 19039.');
  const minio = new (require('minio').Client)({ endPoint: '127.0.0.1', port, useSSL: false, accessKey: 'governance-test', secretKey: 'governance-test-only' });
  const bucket = `governance-test-${require('node:crypto').randomUUID()}`;
  await minio.makeBucket(bucket);
  const jobId = '11111111-1111-4111-8111-111111111111';
  const objects = ['old.txt', 'texture.png', 'history.obj', 'history.mtl', `video-jobs/${jobId}/frame.jpg`, `video-jobs/${jobId}/orphan.jpg`];
  try {
    for (const key of [...objects, 'unrelated.txt']) await minio.putObject(bucket, key, Buffer.from(`test:${key}`));
    await db.Asset.update({ packageManifest: { files: [{ objectKey: 'old.txt' }, { objectKey: 'texture.png' }] } }, { where: { id: 7 } });
    await db.Version.create({ assetId: 7, versionNumber: 1, fileName: 'history.obj', originalName: 'history.obj', mimeType: 'model/obj', size: 1, packageManifest: { files: [{ objectKey: 'history.obj' }, { objectKey: 'history.mtl' }] } });
    await db.AssetAiJob.create({ id: jobId, assetId: 7, workspaceId: 8, sourceFilename: 'old.txt', status: 'succeeded', input: {}, output: { frames: [{ key: `video-jobs/${jobId}/frame.jpg` }] } });
    const first = await lifecycle().trash(7, manager);
    for (const key of objects) assert.ok(await minio.statObject(bucket, key));
    await lifecycle().restore(7, first.id, manager, true);
    const bytes = []; for await (const chunk of await minio.getObject(bucket, 'old.txt')) bytes.push(chunk);
    assert.equal(Buffer.concat(bytes).toString(), 'test:old.txt');
    const second = await lifecycle().trash(7, manager); now = new Date(now.getTime() + RETENTION_MS);
    const purge = createPurgeService(db, { remove: key => minio.removeObject(bucket, key), async listKeys(prefix) { const keys = []; for await (const object of minio.listObjectsV2(bucket, prefix, true)) keys.push(object.name); return keys; } }, () => now);
    assert.equal(await purge.run(await purge.claim(second.id)), true);
    for (const key of objects) await assert.rejects(minio.statObject(bucket, key), error => ['NotFound', 'NoSuchKey'].includes(error.code));
    assert.ok(await minio.statObject(bucket, 'unrelated.txt'));
  } finally {
    const keys = []; for await (const object of minio.listObjectsV2(bucket, '', true)) keys.push(object.name);
    for (const key of keys) await minio.removeObject(bucket, key);
    await minio.removeBucket(bucket);
  }
});

const teamRequest = (body, id = 1) => ({ body, user: { id, workspaceId: 8, teamId: 8, teamRole: 'workspaceOwner' }, params: { userId: 2 } });
integration('role changes record the actual actor and affected member roles in one committed transaction', async () => {
  const team = require('../src/controllers/teamController');
  const res = response(); await team.updateMemberRole(teamRequest({ role: 'collaborator' }), res);
  assert.equal(res.statusCode, 200);
  const event = await db.AuditEvent.findOne({ where: { action: 'member.role_changed' } });
  assert.equal(event.before.role, 'workspaceManager'); assert.equal(event.after.role, 'collaborator');
  assert.equal(event.actorName, 'user1'); assert.equal(event.actorRole, 'workspaceOwner'); assert.equal(event.details.memberName, 'user2');
  await db.User.update({ username: 'renamed' }, { where: { id: 2 } });
  assert.equal((await db.AuditEvent.findByPk(event.id)).details.memberName, 'user2');
});
integration('audit failure rolls back a role change and invite-code regeneration', async () => {
  const team = require('../src/controllers/teamController');
  const original = db.AuditEvent.create; const code = (await db.Team.findByPk(8)).inviteCode;
  db.AuditEvent.create = async () => { throw new Error('audit unavailable'); };
  try {
    let res = response(); await team.updateMemberRole(teamRequest({ role: 'collaborator' }), res); assert.equal(res.statusCode, 500);
    assert.equal((await db.TeamMember.findOne({ where: { userId: 2 } })).role, 'workspaceManager');
    res = response(); await team.regenerateInviteCode(teamRequest({}), res); assert.equal(res.statusCode, 500);
    assert.equal((await db.Team.findByPk(8)).inviteCode, code);
  } finally { db.AuditEvent.create = original; }
});
integration('simultaneous Owner demotions preserve the last Owner and snapshot their original acting role', async () => {
  await db.TeamMember.update({ role: 'workspaceOwner' }, { where: { userId: 2 } });
  const team = require('../src/controllers/teamController');
  const first = teamRequest({ role: 'collaborator' }, 1); first.params.userId = 1;
  const second = teamRequest({ role: 'collaborator' }, 2); second.params.userId = 2;
  const a = response(), b = response(); await Promise.all([team.updateMemberRole(first, a), team.updateMemberRole(second, b)]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 400]);
  assert.equal(await db.TeamMember.count({ where: { teamId: 8, role: 'workspaceOwner' } }), 1);
  assert.equal((await db.AuditEvent.findOne({ where: { action: 'member.role_changed' } })).actorRole, 'workspaceOwner');
});
integration('Workspace creation, join, rename, removal and invite rotation produce safe management events', async () => {
  const team = require('../src/controllers/teamController');
  let res = response(); await team.renameTeam(teamRequest({ name: 'New Studio' }), res); assert.equal(res.statusCode, 200);
  res = response(); await team.regenerateInviteCode(teamRequest({}), res); assert.equal(res.statusCode, 200);
  const inviteCode = res.body.inviteCode;
  await db.User.create({ id: 4, username: 'newuser', email: 'new@example.test', passwordHash: 'unused', role: 'user', isActive: true });
  res = response(); await team.joinTeam({ body: { inviteCode }, user: { id: 4 } }, res); assert.equal(res.statusCode, 201);
  const removed = teamRequest({}); removed.params.userId = 4;
  res = response(); await team.removeMember(removed, res); assert.equal(res.statusCode, 200);
  res = response(); await team.createTeam({ body: { name: 'Second studio' }, user: { id: 1 } }, res); assert.equal(res.statusCode, 201);
  const actions = (await db.AuditEvent.findAll()).map(e => e.action);
  for (const action of ['workspace.created', 'workspace.renamed', 'workspace.invite_regenerated', 'member.joined', 'member.removed']) assert.ok(actions.includes(action));
  assert.ok(!JSON.stringify((await db.AuditEvent.findAll()).map(e => e.toJSON())).includes(inviteCode));
});
integration('Workspace filtering never exposes personal edits even with assetId supplied; Asset view includes both actors', async () => {
  const self = await service.acquire(7, manager);
  let res = response(); await controller.updateAssetMetadata(request({ metadata: { title: 'personal' } }, self), res); assert.equal(res.statusCode, 200);
  const ownerSession = await service.acquire(7, owner);
  res = response(); await controller.updateAssetMetadata(request({ metadata: { title: 'managed' } }, ownerSession, { ...owner, teamRole: 'workspaceOwner' }), res); assert.equal(res.statusCode, 200);
  const audit = require('../src/services/auditService').createAuditService(db);
  const workspace = await audit.list({ workspaceId: 8, scope: 'workspace', assetId: 7, action: 'asset.metadata_changed' });
  assert.equal(workspace.events.length, 1); assert.equal(workspace.events[0].actorId, 1);
  const asset = await audit.list({ workspaceId: 8, scope: 'asset', assetId: 7, action: 'asset.metadata_changed' });
  assert.equal(asset.events.length, 2);
});
integration('actual self regeneration stays in Asset history while Owner regeneration of another upload reaches Workspace', async () => {
  const self = await service.acquire(7, manager);
  let res = response(); await controller.createAiJob(request({ assetId: 7, jobType: 'auto_tag' }, self), res); assert.equal(res.statusCode, 201);
  assert.equal(res.body.editingSessionRetained, true);
  assert.equal((await service.status(7, manager)).sessionId, self.sessionId);
  assert.equal((await db.Asset.findByPk(7)).revision, self.revision);
  await service.release(7, manager, self);
  const ownerSession = await service.acquire(7, owner);
  res = response(); await controller.createAiJob(request({ assetId: 7, jobType: 'auto_tag' }, ownerSession, { ...owner, teamRole: 'workspaceOwner' }), res); assert.equal(res.statusCode, 201);
  const audit = require('../src/services/auditService').createAuditService(db);
  const workspace = await audit.list({ workspaceId: 8, scope: 'workspace', action: 'asset.ai_requested' });
  assert.equal(workspace.events.length, 1); assert.equal(workspace.events[0].actorId, 1);
  assert.equal((await audit.list({ workspaceId: 8, assetId: 7, action: 'asset.ai_requested' })).events.length, 2);
});
integration('audit API permits every current member role, rejects foreign scope and leaves audit history read only', async () => {
  await lifecycle().trash(7, manager);
  const express = require('express'); const app = express(); app.use(express.json());
  app.use('/api/teams', require('../src/routes/teams')); app.use('/api/assets', require('../src/routes/assets'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const headers = id => ({ Authorization: `Bearer ${require('jsonwebtoken').sign({ id, workspaceId: 8 }, process.env.JWT_SECRET || 'your_secret_key')}` });
  try {
    let first;
    for (const id of [1, 2, 3]) {
      const res = await fetch(`${base}/teams/current/audit-events`, { headers: headers(id) }); assert.equal(res.status, 200);
      const body = await res.json(); assert.equal(body.events[0].assetAvailable, false);
      if (first) assert.deepEqual(body.events.map(e => e.id), first); else first = body.events.map(e => e.id);
    }
    assert.equal((await fetch(`${base}/assets/7/audit-events`, { headers: headers(3) })).status, 410);
    assert.equal((await fetch(`${base}/teams/current/audit-events`, { method: 'DELETE', headers: headers(1) })).status, 404);
    assert.equal((await fetch(`${base}/teams/current/audit-events?cursor=not-a-cursor`, { headers: headers(1) })).status, 400);
    assert.equal((await fetch(`${base}/teams/current/audit-events`, { headers: { ...headers(1), 'X-Workspace-Id': '9' } })).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
integration('audit cursors and date/person/category filters keep stable boundaries without duplicates', async () => {
  const { buildEvent, createAuditService } = require('../src/services/auditService');
  const asset = await db.Asset.findByPk(7);
  const actor = { id: 1, username: 'Actor_One', workspaceId: 8, teamRole: 'workspaceOwner' };
  const at = new Date('2026-11-04T12:00:00Z');
  for (let i = 0; i < 5; i++) await db.AuditEvent.create({ ...buildEvent({ workspaceId: 8, asset, actor, action: 'asset.metadata_changed' }), occurredAt: at });
  const audit = createAuditService(db); const query = { workspaceId: 8, scope: 'workspace', category: 'content', actorName: 'Actor_One', result: 'success', from: '2026-11-04T11:00:00Z', to: '2026-11-04T13:00:00Z', limit: 2 };
  const first = await audit.list(query); const second = await audit.list({ ...query, cursor: first.nextCursor }); const third = await audit.list({ ...query, cursor: second.nextCursor });
  assert.equal(new Set([...first.events, ...second.events, ...third.events].map(e => e.id)).size, 5);
  assert.equal((await audit.list({ ...query, actorName: 'Actor%One' })).events.length, 0);
  await assert.rejects(audit.list({ ...query, from: 'invalid' }), /Invalid date range/);
});
async function waitForAudit(predicate) {
  const until = Date.now() + 3000;
  while (Date.now() < until) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('Timed out waiting for transport audit');
}
integration('download records request and exactly one server outcome; preview does not produce audit noise', async () => {
  const express = require('express'); const app = express(); app.use(express.json()); app.use('/api/assets', require('../src/routes/assets'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/assets`;
  const headers = { Authorization: `Bearer ${require('jsonwebtoken').sign({ id: 2, workspaceId: 8 }, process.env.JWT_SECRET || 'your_secret_key')}` };
  try {
    let res = await fetch(`${base}/preview/7`, { headers }); assert.equal(res.status, 200); await res.text();
    assert.equal(await db.AuditEvent.count(), 0);
    res = await fetch(`${base}/download/7`, { headers }); assert.equal(await res.text(), 'test:old.txt');
    await waitForAudit(async () => await db.AuditEvent.count({ where: { action: 'asset.download' } }) === 2);
    let events = await db.AuditEvent.findAll({ where: { action: 'asset.download' } });
    assert.deepEqual(events.map(e => e.result).sort(), ['completed', 'requested']); assert.equal(new Set(events.map(e => e.correlationId)).size, 1);
    downloadFailure = true;
    res = await fetch(`${base}/download/7`, { headers }); assert.equal(res.status, 500); await res.text();
    await waitForAudit(async () => await db.AuditEvent.count({ where: { action: 'asset.download' } }) === 4);
    events = await db.AuditEvent.findAll({ where: { action: 'asset.download', result: 'failed' } }); assert.equal(events.length, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
integration('blocked writes are audited without changing asset data', async () => {
  const express = require('express'); const app = express(); app.use(express.json()); app.use('/api/assets', require('../src/routes/assets'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/assets`;
  const headers = { Authorization: `Bearer ${require('jsonwebtoken').sign({ id: 2, workspaceId: 8 }, process.env.JWT_SECRET || 'your_secret_key')}`, 'Content-Type': 'application/json' };
  try {
    const res = await fetch(`${base}/7/metadata`, { method: 'PUT', headers, body: JSON.stringify({ metadata: { title: 'no lease' } }) }); assert.equal(res.status, 409); await res.text();
    await waitForAudit(async () => await db.AuditEvent.count({ where: { action: 'asset.metadata_changed', result: 'denied' } }) === 1);
    assert.equal((await db.Asset.findByPk(7)).metadata, null);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
integration('snapshot attribution preserves unknown legacy authors and records actual new file submitters', async () => {
  const session = await service.acquire(7, owner);
  const res = response(); await controller.createVersion(request({ changeLog: 'Keep old file' }, session, { ...owner, teamRole: 'workspaceOwner' }), res);
  assert.equal(res.statusCode, 201); assert.equal(res.body.version.createdBy, 1); assert.equal(res.body.version.submittedBy, null);
  const next = await service.acquire(7, manager);
  await db.sequelize.transaction(async transaction => {
    const asset = await db.Asset.findByPk(7, { transaction, lock: transaction.LOCK.UPDATE });
    await service.finish(asset, manager, auth(next), transaction, 'asset.version_uploaded', {}, { file: true });
  });
  const asset = await db.Asset.findByPk(7); assert.equal(asset.fileSubmittedBy, 2); assert.ok(asset.fileSubmittedAt); assert.equal(asset.baseContentVersionId, next.baseContentVersionId);
});
integration('member deactivation records the affected Workspace access change without private account data', async () => {
  await db.User.create({ id: 5, username: 'administrator', email: 'admin@example.test', passwordHash: 'unused', role: 'systemAdministrator', isActive: true });
  const res = response(); await require('../src/controllers/userController').updateAccountStatus({ user: { id: 5 }, params: { id: 2 }, body: { status: 'inactive' } }, res);
  assert.equal(res.statusCode, 200);
  const event = await db.AuditEvent.findOne({ where: { action: 'member.access_changed' } });
  assert.equal(event.actorRole, 'systemAdministrator'); assert.equal(event.before.isActive, true); assert.equal(event.after.isActive, false);
  assert.ok(!JSON.stringify(event.toJSON()).includes('email')); assert.ok(!JSON.stringify(event.toJSON()).includes('password'));
});
integration('new asset upload commits its event and actual submitter without inventing legacy file authors', async () => {
  const fs = require('node:fs'); const path = require('node:path');
  const file = path.join(require('node:os').tmpdir(), `governance-${require('node:crypto').randomUUID()}.txt`);
  fs.writeFileSync(file, 'new', { flag: 'wx' });
  try {
    const req = request({}); req.file = { path: file, originalname: 'new.txt', mimetype: 'text/plain', size: 3 };
    const res = response(); await controller.uploadAsset(req, res); assert.equal(res.statusCode, 201);
    const event = await db.AuditEvent.findOne({ where: { action: 'asset.uploaded' } });
    assert.equal(event.actorId, 2); assert.equal(event.targetName, 'new.txt');
    const asset = await db.Asset.findByPk(event.assetId); assert.equal(asset.fileSubmittedBy, 2); assert.ok(asset.contentVersionId);
    assert.equal((await db.Asset.findByPk(7)).fileSubmittedBy, null);
  } finally { fs.unlinkSync(file); }
});
integration('client interruption produces one interrupted download outcome, never a false completion', async () => {
  slowDownload = true;
  const express = require('express'); const app = express(); app.use('/api/assets', require('../src/routes/assets'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const headers = { Authorization: `Bearer ${require('jsonwebtoken').sign({ id: 2, workspaceId: 8 }, process.env.JWT_SECRET || 'your_secret_key')}` };
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/assets/download/7`, { headers });
    const reader = res.body.getReader(); await reader.read(); await reader.cancel();
    await waitForAudit(async () => await db.AuditEvent.count({ where: { action: 'asset.download', result: 'interrupted' } }) === 1);
    assert.equal(await db.AuditEvent.count({ where: { action: 'asset.download', result: 'completed' } }), 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
