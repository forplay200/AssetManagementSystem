const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('node:fs');
const { Readable } = require('node:stream');

let assets, versions, accounts, memberships, tags, comments, concepts, effects, nextId, teams;
function reset() {
  teams = new Map([[8, { id: 8, name: 'Studio', inviteCode: 'SECRET', async save(options) { effects.push({ teamFields: options.fields }); } }]]);
  effects = []; nextId = 50; versions = [];
  accounts = new Map([1, 2, 3, 4, 5, 6].map(id => [id, { id, role: id === 6 ? 'systemAdministrator' : 'user', isActive: true }]));
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
  sequelize: { transaction: callback => callback({ LOCK: { UPDATE: 'UPDATE' } }), async query() {} },
  User: { async findByPk(id) { return accounts.get(Number(id)); } },
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
    async findOne() { return tags[0]; },
    async findOrCreate() { effects.push('tag.create'); return [tags[0]]; }
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
  normalizeTagName: name => name.trim().toLowerCase(), canonicalizeTagName: async (_workspace, name) => name.trim().toLowerCase(),
  getVisualAssetType: () => '3d', getVocabularySnapshot: async () => ({ entries: [] }),
  getWorkspaceEntries: async () => [], loadCoreVocabulary: () => ({ entries: [] }), findVocabularyEntry: () => null,
  prepareWorkspaceEntry: input => ({ name: input.name, aliases: [], assetTypes: input.assetTypes }),
  vocabularyError: message => Object.assign(new Error(message), { statusCode: 400 })
});
mockModule('../src/utils/minioClient', { BUCKET_NAME: 'assets', minioClient: {
  async fPutObject(_bucket, _key, file) { assert.ok(fs.existsSync(file)); effects.push('minio.put'); },
  async copyObject() { effects.push('minio.copy'); }, async removeObject(_bucket, key) { effects.push('minio.remove:' + key); },
  async getObject() { return Readable.from([Buffer.from('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')]); }
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
