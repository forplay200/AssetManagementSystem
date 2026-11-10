const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('node:fs');
const { Readable } = require('node:stream');

let assets, versions, accounts, memberships, tags, comments, concepts, effects, nextId, teams, storageReads, aiJobs;
function reset() {
  aiJobs = new Map();
  teams = new Map([[8, { id: 8, name: 'Studio', inviteCode: 'SECRET', async save(options) { effects.push({ teamFields: options.fields }); } }]]);
  effects = []; storageReads = []; nextId = 50; versions = [];
  accounts = new Map([1, 2, 3, 4, 5, 6].map(id => [id, { id, username: 'member' + id, role: id === 6 ? 'systemAdministrator' : 'user', isActive: true }]));
  memberships = new Map([[1, 'workspaceOwner'], [2, 'workspaceManager'], [3, 'workspaceManager'], [4, 'collaborator'], [6, 'workspaceOwner']]);
  tags = [{ id: 1, name: 'shared' }]; comments = new Map(); concepts = [{ id: 10, workspaceId: 8 }, { id: 11, workspaceId: 9 }];
  assets = new Map([1, 2, 3].map(id => [id, {
    id, userId: id, workspaceId: 8, filename: 'original-' + id + '.obj', path: 'original-' + id + '.obj', originalname: 'model.obj', mimetype: 'model/obj', size: 40,
    metadata: { label: 'original', ai: { semanticTags: ['car'] } }, tagIds: [1],
    packageManifest: { packageId: 'package-' + id, files: [{ id: 'main', objectKey: 'original-' + id + '.obj', kind: 'source', path: 'model.obj' }, { id: 'texture', objectKey: 'texture-' + id + '.png', kind: 'texture', path: 'texture.png' }] },
    async save(options) { effects.push('asset.save'); if (options?.fields) effects.push({ assetFields: options.fields }); },
    async destroy() { effects.push('asset.destroy'); assets.delete(this.id); },
    async addTag(tag) { effects.push('asset.addTag'); this.tagIds.push(tag.id); },
    async removeTag(tag) { effects.push('asset.removeTag'); this.tagIds = this.tagIds.filter(id => id !== tag.id); },
    async getTags() { return tags.filter(tag => this.tagIds.includes(tag.id)); },
    toJSON() { return { ...this }; }
  }]));
}
const models = {
  AssetAiJob: {
    async create(values) { const job = { ...values, async update(next) { Object.assign(this, next); } }; aiJobs.set(job.id, job); return job; },
    async findByPk(id) { return aiJobs.get(id); },
    async findAll({ where = {} } = {}) { return [...aiJobs.values()].filter(j => where.assetId === undefined || String(j.assetId) === String(where.assetId)); }
  },
  sequelize: { transaction: callback => callback({ LOCK: { UPDATE: 'UPDATE' } }), async query() {} },
  User: {
    async findByPk(id) { return accounts.get(Number(id)); },
    async findAll({ where }) { return where.id.map(id => accounts.get(id)).filter(Boolean); }
  },
  Team: { async findByPk(id) { return teams.get(Number(id)); } },
  TeamMember: { async findOne({ where }) { const role = where.teamId === 8 && memberships.get(Number(where.userId)); return role ? { teamId: 8, role } : null; } },
  Asset: {
    async findByPk(id) { return assets.get(Number(id)); },
    async create(values) { const record = { id: nextId++, ...values, async save() { effects.push('asset.save'); } }; assets.set(record.id, record); effects.push('asset.create'); return record; },
    async findAndCountAll({ where }) { return { count: assets.size, rows: [...assets.values()] }; }
  },
  Version: {
    async max() { return versions.length; },
    async create(values) { effects.push('version.create'); const version = { id: nextId++, ...values }; versions.push(version); return version; },
    async findAll({ where }) { return versions.filter(version => Number(version.assetId) === Number(where.assetId)); },
    async findOne({ where }) { return versions.find(version => Number(version.assetId) === Number(where.assetId) && Number(version.id) === Number(where.id)); },
    async destroy({ where }) { effects.push('version.destroy'); versions = versions.filter(version => version.assetId !== where.assetId); }
  },
  Tag: {
    async findOne({ where }) { const name = typeof where.name === 'string' ? where.name : Object.values(where.name).concat(Object.getOwnPropertySymbols(where.name).map(k => where.name[k]))[0]; return tags.find(t => t.name === name); },
    async findOrCreate({ where }) { effects.push('tag.create'); let tag = tags.find(t => t.name === where.name); if (!tag) { tag = { id: nextId++, name: where.name }; tags.push(tag); } return [tag]; }
  },
  ClipVocabularyEntry: {
    async create(values) { effects.push('vocabulary.create'); const entry = { id: nextId++, ...values, get() { return { ...this }; } }; concepts.push(entry); return entry; },
    async destroy({ where }) { const entry = concepts.find(entry => Number(entry.id) === Number(where.id) && entry.workspaceId === where.workspaceId); if (!entry) return 0; effects.push('vocabulary.destroy'); concepts = concepts.filter(value => value !== entry); return 1; }
  },
  Comment: {
    async create(values) { const comment = { id: nextId++, ...values, async save() { effects.push('comment.save'); } }; comments.set(comment.id, comment); effects.push('comment.create'); return comment; },
    async findByPk(id) { const record = comments.get(Number(id)); return record && { ...record, asset: assets.get(record.assetId), save: record.save.bind(record) }; },
    async findOne({ where }) { return [...comments.values()].find(comment => comment.id === Number(where.id) && comment.assetId === where.assetId); }
  }
};
function mockModule(modulePath, exports) { const id = require.resolve(modulePath); require.cache[id] = { id, filename: id, loaded: true, exports }; }
mockModule('../src/models', models);
mockModule('../src/redisClient', { async lPush() { effects.push('redis.lPush'); } });
mockModule('../src/utils/logger', { error() {} });
mockModule('../src/utils/clipVocabulary', {
  normalizeTagName: name => name.trim().toLowerCase(), canonicalizeTagName: async (_workspace, name) => name.trim().toLowerCase() === 'automobile' ? 'car' : name.trim().toLowerCase(),
  getVisualAssetType: () => '3d', getVocabularySnapshot: async () => ({ entries: [] }),
  getWorkspaceEntries: async () => [], loadCoreVocabulary: () => ({ entries: [] }), findVocabularyEntry: () => null,
  prepareWorkspaceEntry: input => ({ name: input.name, aliases: [], assetTypes: input.assetTypes }),
  vocabularyError: message => Object.assign(new Error(message), { statusCode: 400 })
});
mockModule('../src/utils/minioClient', { BUCKET_NAME: 'assets', minioClient: {
  async fPutObject(_bucket, _key, file) { assert.ok(fs.existsSync(file)); effects.push('minio.put'); },
  async copyObject() { effects.push('minio.copy'); }, async removeObject(_bucket, key) { effects.push('minio.remove:' + key); },
  async getObject(_bucket, key) { storageReads.push(key); return Readable.from([Buffer.from('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')]); },
  async putObject(_bucket, key) { effects.push('minio.put:' + key); },
  async *listObjectsV2() {}
} });

let server, base;
test.before(async () => {
  const app = express(); app.use(express.json()); app.use('/api/assets', require('../src/routes/assets')); app.use('/api/comments', require('../src/routes/comments')); app.use('/api/teams', require('../src/routes/teams'));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(() => new Promise(resolve => server.close(resolve)));
test.beforeEach(reset);

async function request(userId, method, path, body, extraHeaders = {}) {
  const token = jwt.sign({ id: userId, role: 'workspaceOwner', teamRole: 'workspaceOwner', workspaceId: 8 }, process.env.JWT_SECRET || 'your_secret_key');
  const headers = { Authorization: 'Bearer ' + token, 'X-Workspace-Id': '8', ...extraHeaders };
  let payload = body;
  if (body && typeof body === 'object' && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const response = await fetch(base + '/api' + path, { method, headers, body: payload });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
function replacement() {
  const form = new FormData(); form.append('asset', new Blob(['replacement']), 'updated.txt'); form.append('changeLog', 'Changed'); form.append('userId', '99'); return form;
}
const writes = [
  ['PATCH', id => '/assets/' + id + '/name', () => ({ displayName: 'Renamed' })],
  ['PUT', id => '/assets/' + id + '/metadata', () => ({ metadata: { label: 'edited', ai: { semanticTags: ['vehicle'] } } })],
  ['POST', id => '/assets/' + id + '/tags', () => ({ tag: 'shared' })],
  ['DELETE', id => '/assets/' + id + '/tags', () => ({ tag: 'shared' })],
  ['POST', id => '/assets/' + id + '/tags/1', () => ({ tag: 'shared' })],
  ['DELETE', id => '/assets/' + id + '/tags/1', () => ({ tag: 'shared' })],
  ['POST', () => '/assets/ai/job', id => ({ assetId: id, jobType: 'auto_tag', userId: 2, teamRole: 'workspaceOwner' })],
  ['POST', id => '/assets/' + id + '/versions', () => ({ changeLog: 'Snapshot' })],
  ['POST', id => '/assets/' + id + '/versions/upload', replacement],
  ['DELETE', id => '/assets/' + id, () => undefined]
];
for (const [method, path, body] of writes) {
  for (const target of [1, 3]) test(method + ' ' + path(target) + ' refuses manager writes to another uploader before any side effect', async () => {
    const before = assets.get(target).metadata;
    const result = await request(2, method, path(target), body(target));
    assert.equal(result.status, 403, JSON.stringify(result.data)); assert.deepEqual(effects, []);
    assert.equal(assets.get(target).metadata, before); assert.equal(versions.length, 0);
  });
  for (const [actor, target] of [[2, 2], [1, 2], [1, 3]]) test(method + ' ' + path(target) + ' permits ' + actor + ' through the complete route chain', async () => {
    const result = await request(actor, method, path(target), body(target));
    assert.ok([200, 201].includes(result.status), JSON.stringify(result.data)); assert.ok(effects.length);
    if (method === 'POST' && path(target).endsWith('/versions/upload')) {
      assert.equal(assets.get(target).userId, target); assert.equal(versions[0].createdBy, actor);
      assert.ok(versions[0].packageManifest.files.some(file => file.kind === 'texture')); assert.ok(effects.includes('redis.lPush'));
    }
  });
}
test('ownership is insufficient after downgrade, removal, deactivation, or a different workspace', async () => {
  const attempt = () => request(2, 'PUT', '/assets/2/metadata', { metadata: { x: 1 } });
  memberships.set(2, 'collaborator'); assert.equal((await attempt()).status, 403);
  memberships.delete(2); assert.equal((await attempt()).status, 403);
  memberships.set(2, 'workspaceManager'); accounts.get(2).isActive = false; assert.equal((await attempt()).status, 403);
  accounts.get(2).isActive = true;
  assert.equal((await request(2, 'PUT', '/assets/2/metadata', { metadata: {} }, { 'X-Workspace-Id': '9' })).status, 403);
  assert.equal((await request(6, 'DELETE', '/assets/2')).status, 403); assert.deepEqual(effects, []);
});
test('invalid workspace headers cannot restore removed membership claims from a signed JWT', async () => {
  memberships.delete(2);
  for (const workspace of ['invalid', '0', '-1']) {
    assert.equal((await request(2, 'PUT', '/assets/2/metadata', { metadata: {} }, { 'X-Workspace-Id': workspace })).status, 403);
  }
  assert.deepEqual(effects, []);
});
test('replacement ownership is checked before multipart decoding', async () => {
  const result = await request(2, 'POST', '/assets/3/versions/upload', 'not a multipart body', { 'Content-Type': 'multipart/form-data; boundary=missing' });
  assert.equal(result.status, 403); assert.deepEqual(effects, []);
});
test('owner update does not transfer manager ownership; snapshot authorship grants no ownership', async () => {
  assert.equal((await request(1, 'POST', '/assets/2/versions/upload', replacement())).status, 201);
  assert.equal(assets.get(2).userId, 2); assert.equal((await request(2, 'POST', '/assets/ai/job', { assetId: 2, jobType: 'auto_tag' })).status, 201);
  versions.push({ assetId: 3, createdBy: 2 }); effects = [];
  assert.equal((await request(2, 'DELETE', '/assets/3')).status, 403); assert.deepEqual(effects, []);
});
test('new uploads use authenticated uploader and workspace, not body identity', async () => {
  const result = await request(2, 'POST', '/assets/upload', replacement());
  assert.equal(result.status, 201, JSON.stringify(result.data)); assert.equal(result.data.asset.userId, 2); assert.equal(result.data.asset.workspaceId, 8);
});
test('tag and metadata writes affect only the selected asset', async () => {
  assert.equal((await request(2, 'DELETE', '/assets/2/tags', { tag: 'shared' })).status, 200);
  assert.deepEqual(assets.get(3).tagIds, [1]); assert.equal(tags.length, 1);
  assert.equal((await request(2, 'PUT', '/assets/2/metadata', { metadata: { ai: { semanticTags: [] } } })).status, 200);
  assert.deepEqual(assets.get(3).metadata.ai.semanticTags, ['car']);
});
test('manager can manage shared vocabulary on another uploader asset; cross-workspace concepts remain protected', async () => {
  const approved = await request(2, 'POST', '/assets/3/vocabulary', { name: 'katana', confirmed: true, assetTypes: ['3d'] });
  assert.equal(approved.status, 200, JSON.stringify(approved.data)); assert.ok(effects.includes('vocabulary.create'));
  assert.equal((await request(2, 'DELETE', '/assets/3/vocabulary/10')).status, 200);
  assert.equal((await request(2, 'DELETE', '/assets/3/vocabulary/11')).status, 404);
  assert.ok(concepts.some(entry => entry.id === 11));
  assert.equal((await request(2, 'POST', '/assets/ai/job', { assetId: 3, jobType: 'auto_tag' })).status, 403);
  assert.equal((await request(4, 'DELETE', '/assets/3/vocabulary/11')).status, 403);
});
test('reading other uploader assets and history remains available to manager and collaborator', async () => {
  for (const user of [2, 4]) for (const path of ['/assets/3/details', '/assets/3/metadata', '/assets/3/tags', '/assets/3/versions', '/assets/3/package', '/assets/preview/3', '/assets/3/resources/main', '/assets/search']) {
    assert.equal((await request(user, 'GET', path)).status, 200, path);
  }
  assert.equal((await request(2, 'GET', '/assets/download/3?main=true')).status, 200); assert.deepEqual(effects, []);
});
test('comments on another uploader asset remain available; uploader cannot moderate another author', async () => {
  assert.equal((await request(2, 'POST', '/assets/3/comments', { content: 'Manager comment' })).status, 201);
  const own = [...comments.keys()][0];
  assert.equal((await request(2, 'PUT', '/comments/' + own, { content: 'Edited' })).status, 200);
  assert.equal((await request(3, 'PUT', '/comments/' + own, { content: 'Blocked uploader edit' })).status, 403);
  assert.equal((await request(1, 'PUT', '/comments/' + own, { content: 'Owner moderation' })).status, 200);
  assert.equal((await request(4, 'POST', '/assets/3/comments', { content: 'Collaborator reply', parentId: own })).status, 201);
});
test('delete removes the owned complete package and preserved versions only', async () => {
  versions.push({ id: 40, assetId: 2, fileName: 'snapshot.obj', packageManifest: { files: [{ objectKey: 'old-model.obj' }, { objectKey: 'old-texture.png' }] } });
  const result = await request(2, 'DELETE', '/assets/2'); assert.equal(result.status, 200);
  for (const key of ['original-2.obj', 'texture-2.png', 'old-model.obj', 'old-texture.png']) assert.ok(effects.includes('minio.remove:' + key));
  assert.ok(assets.has(3)); assert.equal(versions.length, 0);
});
test('browser tokens cannot write worker results; valid worker can finish, stale or deleted targets fail', async () => {
  const previous = process.env.AI_SERVICE_TOKEN; process.env.AI_SERVICE_TOKEN = 'test-worker-secret';
  try {
    assert.equal((await request(2, 'POST', '/assets/3/ai-result', { metadata: {} })).status, 401);
    assert.equal((await request(2, 'GET', '/assets/3/info')).status, 401);
    const headers = { 'X-AI-Service-Token': 'test-worker-secret' };
    assert.equal((await request(2, 'POST', '/assets/3/ai-result', { metadata: { ai: { semanticTags: ['car'] } } }, headers)).status, 200);
    assert.equal((await request(2, 'POST', '/assets/3/ai-result', { metadata: { ai: { clip: { sourceFilename: 'stale.obj' } } } }, headers)).status, 409);
    assets.delete(3); assert.equal((await request(2, 'POST', '/assets/3/ai-result', { metadata: {} }, headers)).status, 404); assert.ok(!assets.has(3));
  } finally { if (previous === undefined) delete process.env.AI_SERVICE_TOKEN; else process.env.AI_SERVICE_TOKEN = previous; }
});

test('renaming writes only displayName and preserves file, ownership, package and version data', async () => {
  const asset = assets.get(2), before = { ...asset };
  const result = await request(2, 'PATCH', '/assets/2/name', { displayName: '  主角 🐧  ', userId: 99, workspaceId: 9, originalname: 'evil.fbx', filename: 'evil', metadata: {} });
  assert.equal(result.status, 200); assert.equal(result.data.asset.displayName, '主角 🐧');
  assert.deepEqual(effects, ['asset.save', { assetFields: ['displayName'] }]);
  for (const key of ['userId', 'workspaceId', 'originalname', 'filename', 'metadata', 'packageManifest', 'path']) assert.deepEqual(asset[key], before[key]);
  effects = []; assert.equal((await request(2, 'PATCH', '/assets/2/name', { displayName: '主角 🐧' })).status, 200); assert.deepEqual(effects, []);
  assert.equal((await request(2, 'POST', '/assets/2/versions/upload', replacement())).data.asset.displayName, '主角 🐧');
  assert.equal(versions[0].originalName, 'model.obj');
});
test('asset rename is refused after downgrade, removal, inactivity, admin and cross-workspace access', async () => {
  const attempt = () => request(2, 'PATCH', '/assets/2/name', { displayName: 'Changed' });
  memberships.set(2, 'collaborator'); assert.equal((await attempt()).status, 403);
  memberships.delete(2); assert.equal((await attempt()).status, 403);
  memberships.set(2, 'workspaceManager'); accounts.get(2).isActive = false; assert.equal((await attempt()).status, 403);
  assert.equal((await request(6, 'PATCH', '/assets/2/name', { displayName: 'Changed' })).status, 403);
  assets.get(1).workspaceId = 9; assert.equal((await request(1, 'PATCH', '/assets/1/name', { displayName: 'Changed' })).status, 403);
  assets.get(1).workspaceId = null; assert.equal((await request(1, 'PATCH', '/assets/1/name', { displayName: 'Changed' })).status, 403);
  assert.deepEqual(effects, []);
});
test('workspace rename is owner-only, ignores forged IDs and writes only name', async () => {
  for (const actor of [2, 4, 5, 6]) assert.equal((await request(actor, 'PATCH', '/teams/current/name', { name: 'Changed', role: 'workspaceOwner' })).status, 403);
  assert.deepEqual(effects, []);
  const result = await request(1, 'PATCH', '/teams/current/name', { name: '  工作室 🐧  ', workspaceId: 9, teamId: 9, inviteCode: 'EVIL' });
  assert.deepEqual(result, { status: 200, data: { team: { id: 8, name: '工作室 🐧' }, role: 'workspaceOwner' } });
  assert.equal(teams.get(8).inviteCode, 'SECRET'); assert.deepEqual(effects, [{ teamFields: ['name'] }]);
  effects = []; assert.equal((await request(1, 'PATCH', '/teams/current/name', { name: '工作室 🐧' })).status, 200); assert.deepEqual(effects, []);
});
test('rename endpoints validate raw controls, type and trimmed UTF-16 length with no side effects', async () => {
  for (const [path, field, min, max] of [['/assets/2/name', 'displayName', 1, 200], ['/teams/current/name', 'name', 2, 100]]) {
    for (const value of [undefined, null, 12, [], {}, '', '   ', 'a'.repeat(max + 1), 'abc\n', '\tname', 'a\u007fb', 'a\u0085b', ...(min === 2 ? ['a', ' a '] : [])]) {
      const result = await request(1, 'PATCH', path, { [field]: value });
      assert.equal(result.status, 400, JSON.stringify(value)); assert.equal(result.data.errors[0].field, field); assert.deepEqual(effects, []);
    }
    for (const value of ['a'.repeat(min), 'a'.repeat(max), '🐧'.repeat(max / 2), '  中文 标点!  ']) {
      assert.equal((await request(1, 'PATCH', path, { [field]: value })).status, 200); effects = [];
    }
  }
});
test('rename missing targets return 404; authentication convention is preserved', async () => {
  assert.equal((await request(1, 'PATCH', '/assets/999/name', { displayName: 'Changed' })).status, 404);
  teams.clear(); assert.equal((await request(1, 'PATCH', '/teams/current/name', { name: 'Changed' })).status, 404);
  assert.equal((await fetch(base + '/api/assets/2/name', { method: 'PATCH' })).status, 401);
  assert.equal((await request(1, 'PATCH', '/assets/2/name', {}, { Authorization: 'Bearer invalid' })).status, 400);
  assert.deepEqual(effects, []);
});

function downloadFixture(packaged) {
  if (!packaged) assets.get(3).packageManifest = null;
  versions.push({ id: 40, assetId: 3, fileName: 'legacy.obj', originalName: 'legacy.obj', mimeType: 'model/obj', packageManifest: packaged ? assets.get(3).packageManifest : null });
}
for (const packaged of [false, true]) for (const main of ['', '?main=true']) {
  for (const path of ['/assets/download/3', '/assets/3/versions/40/download']) {
    test('collaborator denied before storage read: ' + path + main + ' package=' + packaged, async () => {
      downloadFixture(packaged);
      const result = await request(4, 'GET', path + main, undefined, { 'X-Team-Role': 'workspaceOwner', 'X-Role': 'workspaceOwner' });
      assert.equal(result.status, 403); assert.deepEqual(storageReads, []); assert.deepEqual(effects, []);
    });
    for (const actor of [1, 2]) test('owner/manager can download another uploader asset: ' + actor + path + main + ' package=' + packaged, async () => {
      downloadFixture(packaged); assert.equal((await request(actor, 'GET', path + main)).status, 200);
      assert.ok(storageReads.length); assert.deepEqual(effects, []);
    });
  }
}
test('database role downgrade invalidates downloads with the same previously issued token', async () => {
  const token = jwt.sign({ id: 2, role: 'workspaceManager', workspaceId: 8 }, process.env.JWT_SECRET || 'your_secret_key');
  const headers = { Authorization: 'Bearer ' + token };
  assert.equal((await request(2, 'GET', '/assets/download/3?main=true', undefined, headers)).status, 200);
  storageReads = []; memberships.set(2, 'collaborator');
  assert.equal((await request(2, 'GET', '/assets/download/3?main=true', undefined, headers)).status, 403);
  assert.deepEqual(storageReads, []); assert.equal((await request(2, 'GET', '/assets/preview/3', undefined, headers)).status, 200);
});
test('download remains denied for removed, inactive, administrative and wrong-workspace users', async () => {
  memberships.delete(2); assert.equal((await request(2, 'GET', '/assets/download/3')).status, 403);
  memberships.set(2, 'workspaceManager'); accounts.get(2).isActive = false;
  assert.equal((await request(2, 'GET', '/assets/download/3')).status, 403);
  assert.equal((await request(6, 'GET', '/assets/download/3')).status, 403);
  assert.equal((await request(1, 'GET', '/assets/download/3', undefined, { 'X-Workspace-Id': '9' })).status, 403);
  assert.deepEqual(storageReads, []);
});
test('version preview stays inline for all viewing roles and ignores download-like query parameters', async () => {
  downloadFixture(true);
  for (const actor of [1, 2, 4]) {
    storageReads = [];
    const token = jwt.sign({ id: actor }, process.env.JWT_SECRET || 'your_secret_key');
    const response = await fetch(base + '/api/assets/3/versions/40/preview?main=false&download=true&disposition=attachment', { headers: { Authorization: 'Bearer ' + token, 'X-Workspace-Id': '8' } });
    assert.equal(response.status, 200); assert.match(response.headers.get('content-disposition'), /^inline;/);
    assert.equal(response.headers.get('content-type'), 'model/obj'); await response.text();
    assert.deepEqual(storageReads, ['legacy.obj']);
  }
});
test('version attribution separates current submitter, historical submitter and snapshot saver', async () => {
  Object.assign(assets.get(3), { fileSubmittedBy: 2, fileSubmittedAt: '2026-11-09T09:00:03.000Z' });
  versions.push(
    { id: 40, assetId: 3, createdBy: 1, submittedBy: 3, submittedAt: '2026-11-09T08:00:01.000Z', createdAt: '2026-11-09T08:00:02.000Z' },
    { id: 41, assetId: 3, createdBy: 99, submittedBy: null }
  );
  const current = await request(4, 'GET', '/assets/3/details');
  assert.equal(current.status, 200);
  assert.equal(current.data.fileSubmittedByName, 'member2');
  const history = await request(4, 'GET', '/assets/3/versions');
  assert.equal(history.status, 200);
  assert.deepEqual(history.data.map(version => [version.createdByName, version.submittedByName]), [['member1', 'member3'], [null, null]]);
  const snapshot = await request(4, 'GET', '/assets/3/versions/40');
  assert.deepEqual(snapshot.data, history.data[0]);
});
test('version previews validate both asset and version ownership before reading storage', async () => {
  downloadFixture(false);
  assert.equal((await request(4, 'GET', '/assets/2/versions/40/preview')).status, 404);
  assert.equal((await request(4, 'GET', '/assets/3/versions/999/preview')).status, 404);
  assets.get(3).workspaceId = 9;
  assert.equal((await request(4, 'GET', '/assets/3/versions/40/preview')).status, 403);
  assert.deepEqual(storageReads, []);
});

const videoService = require('../src/services/assetAiJobs');
function videoFixture() {
  const asset = assets.get(2);
  asset.filename = 'immutable.mp4'; asset.mimetype = 'video/mp4'; asset.originalname = 'clip.mp4'; asset.packageManifest = null;
  asset.metadata = { description: 'manual', media: { type: 'video', durationSeconds: 4 }, ai: { type: 'video', videoTags: [] } };
  return asset;
}
async function videoTask() {
  const asset = videoFixture();
  return models.sequelize.transaction(transaction => videoService.create(asset, 2, transaction));
}
test('video tasks fix input, duplicate enqueue reuses active job and newer task invalidates old lease', async () => {
  const job = await videoTask(), asset = assets.get(2);
  const same = await models.sequelize.transaction(t => videoService.create(asset, 2, t)); assert.equal(same.id, job.id);
  const claimed = await videoService.claim(2, job.id, asset.filename);
  await assert.rejects(videoService.claim(2, job.id, asset.filename), e => e.status === 409);
  await assert.rejects(videoService.heartbeat(2, job.id, 'forged', 'tagging'), e => e.status === 409);
  assert.equal((await videoService.heartbeat(2, job.id, claimed.leaseToken, 'tagging')).status, 'processing');
  const next = await models.sequelize.transaction(t => videoService.create(asset, 2, t, true));
  assert.notEqual(next.id, job.id); assert.equal(job.status, 'superseded');
  await assert.rejects(videoService.complete(2, job.id, claimed.leaseToken, { error: true }), e => e.status === 409);
});
test('video status/evidence/review enforce current workspace, viewing roles and original uploader rules', async () => {
  const job = await videoTask();
  job.status = 'succeeded'; job.output = { candidates: [{ id: 'c0', name: 'penguin', facet: 'content', decision: 'pending', finalText: null, frameIds: ['f0'], maxScore: 0.3, hitFrameCount: 1, sampleCount: 1 }], frames: [{ id: 'f0', timeSeconds: 1, key: 'private-evidence' }] };
  for (const actor of [1, 2, 3, 4]) {
    assert.equal((await request(actor, 'GET', '/assets/2/ai-jobs/current')).status, 200);
    assert.equal((await request(actor, 'GET', `/assets/2/ai-jobs/${job.id}/frames/f0`)).status, 200);
  }
  const review = `/assets/2/ai-jobs/${job.id}/review`, body = { decisions: [{ candidateId: 'c0', decision: 'accepted' }] };
  assert.equal((await request(3, 'POST', review, body)).status, 403);
  assert.equal((await request(4, 'POST', review, body)).status, 403);
  assert.equal((await request(6, 'GET', '/assets/2/ai-jobs/current')).status, 403);
  assert.equal((await request(2, 'GET', '/assets/2/ai-jobs/current', undefined, { 'X-Workspace-Id': '9' })).status, 403);
  assert.equal((await request(2, 'GET', `/assets/3/ai-jobs/${job.id}/frames/f0`)).status, 404);
  const accepted = await request(2, 'POST', review, body);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data)); assert.deepEqual(accepted.data.metadata.ai.videoTags, ['penguin']);
  assert.equal((await request(2, 'POST', review, body)).status, 200); assert.equal(tags.filter(t => t.name === 'penguin').length, 1);
  assert.equal((await request(1, 'DELETE', '/assets/2/tags', { tag: 'penguin' })).status, 200);
  assert.deepEqual(assets.get(2).metadata.ai.videoTags, []);
  await request(2, 'POST', review, body); assert.deepEqual(assets.get(2).metadata.ai.videoTags, []);
});
test('pending/rejected suggestions stay out of metadata and edited acceptance keeps manual tags', async () => {
  const job = await videoTask(); job.status = 'succeeded';
  job.output = { candidates: [{ id: 'c0', name: 'secret-pending', decision: 'pending' }, { id: 'c1', name: 'other', decision: 'pending' }] };
  assert.ok(!JSON.stringify(assets.get(2).metadata).includes('secret-pending'));
  await videoService.review(2, job.id, { id: 2, teamRole: 'workspaceManager', workspaceId: 8 }, [{ candidateId: 'c0', decision: 'rejected' }]);
  assert.ok(!JSON.stringify(assets.get(2).metadata).includes('secret-pending'));
  await videoService.review(2, job.id, { id: 1, teamRole: 'workspaceOwner', workspaceId: 8 }, [{ candidateId: 'c1', decision: 'edited', text: '  Winter Bird  ' }]);
  assert.deepEqual(assets.get(2).metadata.ai.videoTags, ['winter bird']); assert.ok(assets.get(2).tagIds.includes(1));
  await videoService.review(2, job.id, { id: 1, teamRole: 'workspaceOwner', workspaceId: 8 }, [{ candidateId: 'c0', decision: 'pending' }]);
  await videoService.review(2, job.id, { id: 1, teamRole: 'workspaceOwner', workspaceId: 8 }, [{ candidateId: 'c0', decision: 'edited', text: ' AUTOMOBILE ' }]);
  assert.ok(assets.get(2).metadata.ai.videoTags.includes('car')); assert.ok(!tags.some(t => t.name === 'automobile'));
});
test('video protected fields survive stale metadata PUT; ID-less callback cannot overwrite video or inject video results', async () => {
  await videoTask(); const media = structuredClone(assets.get(2).metadata.media);
  const result = await request(2, 'PUT', '/assets/2/metadata', { metadata: { description: 'changed', media: { durationSeconds: 900 }, ai: { type: 'video', videoTags: ['forged'] }, currentAiJobId: 'forged' } });
  assert.equal(result.status, 200); assert.deepEqual(result.data.metadata.media, media); assert.deepEqual(result.data.metadata.ai.videoTags, []);
  const previous = process.env.AI_SERVICE_TOKEN; process.env.AI_SERVICE_TOKEN = 'worker';
  try {
    const headers = { 'X-AI-Service-Token': 'worker' };
    assert.equal((await request(2, 'POST', '/assets/2/ai-result', { metadata: { ai: { imageTags: ['wrong'] } } }, headers)).status, 409);
    assets.get(2).mimetype = 'image/png';
    assert.equal((await request(2, 'POST', '/assets/2/ai-result', { metadata: { ai: { type: 'video', videoTags: ['wrong'] } } }, headers)).status, 409);
  } finally { if (previous === undefined) delete process.env.AI_SERVICE_TOKEN; else process.env.AI_SERVICE_TOKEN = previous; }
});
test('expired lease is rejected and recovery requeues a BRPOP-lost video job with bounded attempts', async () => {
  const job = await videoTask(); const claim = await videoService.claim(2, job.id, job.sourceFilename);
  job.leaseExpiresAt = new Date(Date.now() - 1);
  await assert.rejects(videoService.complete(2, job.id, claim.leaseToken, { error: true }), e => e.status === 409);
  await videoService.recover(); assert.equal(job.status, 'queued'); assert.ok(effects.includes('redis.lPush'));
  job.status = 'processing'; job.attempt = 3; job.leaseExpiresAt = new Date(Date.now() - 1);
  await videoService.recover(); assert.equal(job.status, 'failed');
});
test('video version replacement snapshots media and invalidates the old job even across media types', async () => {
  const job = await videoTask(); const claim = await videoService.claim(2, job.id, job.sourceFilename);
  const result = await request(2, 'POST', '/assets/2/versions/upload', replacement());
  assert.equal(result.status, 201, JSON.stringify(result.data)); assert.equal(versions[0].metadata.media.type, 'video');
  assert.equal(versions[0].metadata.videoJobId, null); assert.equal(assets.get(2).metadata.media, undefined); assert.equal(assets.get(2).currentAiJobId, null);
  await assert.rejects(videoService.complete(2, job.id, claim.leaseToken, { error: true }), e => e.status === 409);
});
test('internal video endpoints reject browser tokens and valid worker credentials cannot substitute asset or source', async () => {
  const job = await videoTask();
  const previous = process.env.AI_SERVICE_TOKEN; process.env.AI_SERVICE_TOKEN = 'worker';
  try {
    assert.equal((await request(2, 'POST', `/assets/2/ai-jobs/${job.id}/claim`, { sourceFilename: job.sourceFilename })).status, 401);
    const headers = { 'X-AI-Service-Token': 'worker' };
    assert.equal((await request(2, 'POST', `/assets/3/ai-jobs/${job.id}/claim`, { sourceFilename: job.sourceFilename }, headers)).status, 404);
    assert.equal((await request(2, 'POST', `/assets/2/ai-jobs/${job.id}/claim`, { sourceFilename: 'other.mp4' }, headers)).status, 409);
    assert.equal((await request(2, 'POST', `/assets/2/ai-jobs/${job.id}/claim`, { sourceFilename: job.sourceFilename }, headers)).status, 200);
  } finally { if (previous === undefined) delete process.env.AI_SERVICE_TOKEN; else process.env.AI_SERVICE_TOKEN = previous; }
});

test('video completion re-encodes bounded evidence and duplicate acknowledgement performs no extra storage writes', async () => {
  const job = await videoTask(); const claim = await videoService.claim(2, job.id, job.sourceFilename);
  const jpeg = await require('sharp')({ create: { width: 8, height: 8, channels: 3, background: 'blue' } }).jpeg().toBuffer();
  const payload = { output: { candidates: [], frames: [{ id: 'f0', timeSeconds: 1, jpegBase64: jpeg.toString('base64') }], sampling: { requestedCount: 2, decodedCount: 2, times: [1, 3], requestIndices: [0, 1] }, elapsedSeconds: 0.5 } };
  const result = await videoService.complete(2, job.id, claim.leaseToken, payload);
  assert.equal(result.status, 'succeeded'); assert.equal(result.frames[0].key, undefined); assert.equal(result.frames[0].mime, 'image/jpeg');
  assert.deepEqual(assets.get(2).metadata.ai.videoTags, []);
  const count = effects.length;
  assert.equal((await videoService.complete(2, job.id, claim.leaseToken, payload)).status, 'succeeded'); assert.equal(effects.length, count);
  await assert.rejects(videoService.review(2, job.id, { id: 2, workspaceId: 8, teamRole: 'workspaceManager' }, [null]), e => e.status === 400);
});
test('video rejects malformed result sizes, frame times and failed sampling without publishing output', async () => {
  for (const output of [null, { candidates: [], frames: [] }, { candidates: [], frames: [{ id: '../bad', timeSeconds: 1, jpegBase64: 'x' }] }]) {
    assert.throws(() => videoService.validateOutput(output, 4), e => e.status === 400);
  }
  const job = await videoTask(); const claim = await videoService.claim(2, job.id, job.sourceFilename);
  assert.equal((await videoService.complete(2, job.id, claim.leaseToken, { error: true, retryable: true })).status, 'queued');
  assert.equal(job.output, undefined);
});

test('new sampling snapshots cap at 45, old jobs retain 30, and callbacks bind evidence to real sampling indices', async () => {
  const { samplingTimes } = require('../src/utils/videoPolicy');
  const job = await videoTask();
  assert.deepEqual(job.input.sampling, { version: 'midpoint-v2', maxFrames: 45, intervalSeconds: 2 });
  assert.equal(job.input.processing.deadlineSeconds, 300);
  for (const [version, maxFrames] of [['midpoint-v1', 30], ['midpoint-v2', 45]]) {
    const policy = { version, maxFrames, intervalSeconds: 2 }, times = samplingTimes(180, policy);
    const payload = { candidates: [], frames: [{ id: 'f0', timeSeconds: times[0], jpegBase64: 'jpeg' }], sampling: { requestedCount: times.length, decodedCount: times.length, times, requestIndices: times.map((_, i) => i) } };
    assert.equal(videoService.validateOutput(payload, 180, policy).sampling.requestedCount, maxFrames);
    for (const mutate of [
      p => p.sampling.requestedCount++, p => p.sampling.times[1] = p.sampling.times[0],
      p => p.frames[0].timeSeconds = 0, p => p.frames[0].id = 'f99',
      ...(version === 'midpoint-v2' ? [p => p.sampling.requestIndices[1] = 0, p => p.sampling.times[1] = times[1] - 1] : [])
    ]) { const bad = structuredClone(payload); mutate(bad); assert.throws(() => videoService.validateOutput(bad, 180, policy), e => e.status === 400); }
  }
});
test('WebM uses the same durable jobs, role checks, legacy callback refusal and collaborator preview/download split', async () => {
  const asset = videoFixture(); asset.filename = 'immutable.webm'; asset.originalname = 'clip.webm'; asset.mimetype = 'video/webm'; asset.metadata.media.container = 'webm';
  const job = await models.sequelize.transaction(t => videoService.create(asset, 2, t));
  assert.ok(job); assert.equal(job.input.media.container, 'webm');
  assert.equal((await request(4, 'GET', '/assets/preview/2')).status, 200);
  assert.equal((await request(4, 'GET', '/assets/download/2')).status, 403);
  assert.equal((await request(3, 'POST', '/assets/ai/job', { assetId: 2, jobType: 'auto_tag' })).status, 403);
  assert.equal((await request(4, 'GET', '/assets/2/ai-jobs/current')).status, 200);
});
