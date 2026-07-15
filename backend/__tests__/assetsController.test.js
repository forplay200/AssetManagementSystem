const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

let versionWhere;
let puts = [];
let queuedJobs = [];
let assetRecord;
let createdVersion;
let searchOptions;
let assetCountOptions;
let recentAssetOptions;
let commentCountOptions;
let memberCountOptions;
let createdAssetValues;
const models = {
  Version: {
    async findOne(options) { versionWhere = options.where; return { id: 9, versionNumber: 2 }; },
    async count() { return 1; },
    async create(values) { createdVersion = { id: 10, createdAt: new Date('2026-01-02'), ...values, async save() {}, async destroy() {} }; return createdVersion; }
  },
  Asset: {
    async findByPk() { return assetRecord; },
    async create(values) { createdAssetValues = values; return { id: 21, ...values }; },
    async findAndCountAll(options) { searchOptions = options; return { count: 0, rows: [] }; },
    async count(options) { assetCountOptions = options; return 0; },
    async findAll(options) { recentAssetOptions = options; return []; }
  },
  Tag: {},
  User: { async findAll() { return []; } },
  Comment: { async count(options) { commentCountOptions = options; return 0; } },
  TeamMember: { async count(options) { memberCountOptions = options; return 1; } }
};

function mockModule(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

mockModule('../src/models', models);
mockModule('../src/redisClient', { async lPush(_queue, payload) { queuedJobs.push(JSON.parse(payload)); } });
mockModule('axios', { async post() {} });
mockModule('../src/utils/logger', { error() {} });
mockModule('../src/utils/minioClient', { minioClient: { async getObject() { return Readable.from([Buffer.from('previous')]); }, async putObject(_bucket, key, buffer) { puts.push({ key, buffer }); }, async removeObject() {} }, BUCKET_NAME: 'assets' });
const controller = require('../src/controllers/assetsController');

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } };
}

test('specific version lookup uses the :id route parameter as assetId', async () => {
  assetRecord = { id: 7, filename: 'stored.png', originalname: 'hero.png', mimetype: 'image/png', size: 100, userId: 3, uploadedAt: new Date('2026-01-01') };
  const res = response();
  await controller.getVersion({ params: { id: '7', versionId: '9' } }, res);
  assert.deepEqual(versionWhere, { id: '9', assetId: '7' });
  assert.equal(res.payload.versionNumber, 2);
});

test('search applies the active workspace predicate before pagination', async () => {
  const res = response();
  await controller.searchAssets({ user: { workspaceId: 9 }, query: { q: 'car', page: 1, pageSize: 10 } }, res);
  const andSymbol = Object.getOwnPropertySymbols(searchOptions.where).find(symbol => symbol.description === 'and');
  assert.ok(andSymbol);
  assert.ok(searchOptions.where[andSymbol].some(clause => clause.workspaceId === 9));
  assert.equal(res.payload.totalItems, 0);
});

test('new workspace dashboard queries only its empty repository', async () => {
  const res = response();
  await controller.getDashboardStats({ user: { workspaceId: 12 } }, res);
  assert.deepEqual(assetCountOptions.where, { workspaceId: 12 });
  assert.deepEqual(recentAssetOptions.where, { workspaceId: 12 });
  assert.deepEqual(memberCountOptions.where, { teamId: 12 });
  assert.deepEqual(commentCountOptions.include[0].where, { workspaceId: 12 });
  assert.equal(res.payload.totalAssets, 0);
  assert.deepEqual(res.payload.recentUploads, []);
});

test('upload assigns the active workspace and keeps the compatibility value', async () => {
  const res = response();
  await controller.uploadAsset({
    user: { id: 3, workspaceId: 22, teamRole: 'manager' },
    file: { originalname: 'car.fbx', mimetype: 'model/fbx', size: 8, buffer: Buffer.from('model') }
  }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(createdAssetValues.workspaceId, 22);
  assert.equal(createdAssetValues.teamId, 22);
});

test('authenticated asset details expose ownership context', async () => {
  assetRecord = { id: 7, filename: 'stored.png', originalname: 'hero.png', mimetype: 'image/png', size: 100, userId: 3, workspaceId: 4, uploadedAt: new Date('2026-01-01') };
  const res = response();
  await controller.getAssetDetails({ params: { id: '7' } }, res);
  assert.equal(res.payload.userId, 3);
  assert.equal(res.payload.workspaceId, 4);
  assert.equal(res.payload.originalname, 'hero.png');
});

test('new version upload preserves the previous file and replaces the current asset', async () => {
  puts = [];
  queuedJobs = [];
  assetRecord = { id: 7, filename: 'stored.png', originalname: 'hero.png', mimetype: 'image/png', size: 100, path: 'stored.png', userId: 3, workspaceId: 4, metadata: { description: 'Hero', ai: { imageTags: ['old'] } }, uploadedAt: new Date('2026-01-01'), async save() {} };
  const res = response();
  await controller.uploadNewVersion({ params: { id: '7' }, user: { id: 3, role: 'user', workspaceId: 4, teamRole: 'manager' }, body: { changeLog: 'Updated hero' }, file: { originalname: 'hero-v2.png', mimetype: 'image/png', size: 200, buffer: Buffer.from('replacement') } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(createdVersion.originalName, 'hero.png');
  assert.match(createdVersion.fileName, /^versions\/7\/10\//);
  assert.equal(assetRecord.originalname, 'hero-v2.png');
  assert.deepEqual(assetRecord.metadata, { description: 'Hero' });
  assert.equal(puts.length, 2);
  assert.equal(queuedJobs[0].assetId, 7);
});
