const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

let versionWhere;
let puts = [];
let queuedJobs = [];
let assetRecord;
let createdVersion;
const models = {
  Version: {
    async findOne(options) { versionWhere = options.where; return { id: 9, versionNumber: 2 }; },
    async count() { return 1; },
    async create(values) { createdVersion = { id: 10, createdAt: new Date('2026-01-02'), ...values, async save() {}, async destroy() {} }; return createdVersion; }
  },
  Asset: { async findByPk() { return assetRecord; } },
  Tag: {}, User: {}, Comment: {}
};

function mockModule(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

mockModule('../src/models', models);
mockModule('../src/redisClient', { async lPush(_queue, payload) { queuedJobs.push(JSON.parse(payload)); } });
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

test('authenticated asset details expose ownership context', async () => {
  assetRecord = { id: 7, filename: 'stored.png', originalname: 'hero.png', mimetype: 'image/png', size: 100, userId: 3, uploadedAt: new Date('2026-01-01') };
  const res = response();
  await controller.getAssetDetails({ params: { id: '7' } }, res);
  assert.equal(res.payload.userId, 3);
  assert.equal(res.payload.originalname, 'hero.png');
});

test('new version upload preserves the previous file and replaces the current asset', async () => {
  puts = [];
  queuedJobs = [];
  assetRecord = { id: 7, filename: 'stored.png', originalname: 'hero.png', mimetype: 'image/png', size: 100, path: 'stored.png', userId: 3, metadata: { description: 'Hero', ai: { imageTags: ['old'] } }, uploadedAt: new Date('2026-01-01'), async save() {} };
  const res = response();
  await controller.uploadNewVersion({ params: { id: '7' }, user: { id: 3, role: 'developer' }, body: { changeLog: 'Updated hero' }, file: { originalname: 'hero-v2.png', mimetype: 'image/png', size: 200, buffer: Buffer.from('replacement') } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(createdVersion.originalName, 'hero.png');
  assert.match(createdVersion.fileName, /^versions\/7\/10\//);
  assert.equal(assetRecord.originalname, 'hero-v2.png');
  assert.deepEqual(assetRecord.metadata, { description: 'Hero' });
  assert.equal(puts.length, 2);
  assert.equal(queuedJobs[0].assetId, 7);
});
