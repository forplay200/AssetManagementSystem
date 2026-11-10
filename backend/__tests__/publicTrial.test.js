const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../src/services/trialPolicy');
const quotas = require('../src/services/resourceQuota');
const original = { ...process.env };
after(() => { for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key]; Object.assign(process.env, original); });
test('public trial fails closed without a strong signing secret', () => {
  process.env.PUBLIC_TRIAL_ENABLED = 'true'; delete process.env.JWT_SECRET;
  assert.throws(policy.jwtSecret); process.env.JWT_SECRET = 'your_secret_key'; assert.throws(policy.jwtSecret);
  process.env.JWT_SECRET = 'x'.repeat(48); assert.equal(policy.jwtSecret().length, 48);
});
test('community link defaults to open; optional shared access and pause are enforced', () => {
  delete process.env.REGISTRATION_MODE; assert.doesNotThrow(() => policy.registration());
  process.env.REGISTRATION_MODE = 'invite'; delete process.env.TRIAL_INVITE_CODE; assert.throws(() => policy.registration('code'), e => e.status === 503);
  process.env.TRIAL_INVITE_CODE = 'community-code'; assert.throws(() => policy.registration('wrong'), e => e.status === 403);
  assert.doesNotThrow(() => policy.registration('community-code'));
  process.env.REGISTRATION_MODE = 'closed'; assert.throws(() => policy.registration('community-code'), e => e.status === 403);
  delete process.env.REGISTRATION_MODE;
});
test('storage counts distinct current/history/package/trash/video objects and all global leftovers', async () => {
  const db = {
    Asset: { findAll: async () => [{ id: 1, filename: 'shared' }, { id: 2, filename: 'trash' }] },
    Version: { findAll: async ({ where }) => where.assetId === 1 ? [{ fileName: 'shared' }, { packageManifest: { files: [{ objectKey: 'texture' }] } }] : [] },
    AssetAiJob: { findAll: async () => [{ id: 'j1', output: { frames: [{ key: 'frame' }] } }] }
  };
  const storage = { async *listObjectsV2() { for (const name of ['shared', 'trash', 'texture', 'frame', 'video-jobs/j1/orphan', 'other-workspace']) yield { name, size: 10 }; } };
  const result = await quotas.usage(db, storage, 'assets', 8);
  assert.equal(result.workspaceBytes, 50); assert.equal(result.totalBytes, 60);
});
test('public trial migration supports a fresh database with no Users table', async () => {
  let created = false;
  await require('../migrations/20261105000000-add-public-trial').up({ showAllTables: async () => [], createTable: async () => { created = true; }, describeTable: async () => { throw new Error('Must not describe a missing table'); } }, require('sequelize').DataTypes);
  assert.equal(created, true);
});

const url = process.env.TEST_TRIAL_DATABASE_URL;
if (url && (!['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/trial_test')) throw new Error('Use a dedicated local trial_test database');
let db, redis;
before(async () => {
  if (!url) return;
  const S = require('sequelize'); db = { Sequelize: S, sequelize: new S.Sequelize(url, { logging: false, pool: { max: 6 } }) };
  const path = require('node:path');
  for (const file of require('node:fs').readdirSync(path.join(__dirname, '../src/models')).filter(f => f.endsWith('.js') && f !== 'index.js')) { const model = require('../src/models/' + file)(db.sequelize, S.DataTypes); db[model.name] = model; }
  for (const model of Object.values(db)) if (model.associate) model.associate(db);
  await db.sequelize.sync({ force: true });
  const migrate = require('../migrations/20261105000000-add-public-trial').up;
  await db.sequelize.getQueryInterface().dropTable('TrialUsages');
  await db.sequelize.getQueryInterface().removeColumn('Users', 'tokenVersion');
  await migrate(db.sequelize.getQueryInterface(), S); await migrate(db.sequelize.getQueryInterface(), S);
  redis = require('redis').createClient({ url: process.env.TEST_TRIAL_REDIS_URL }); await redis.connect();
});
after(async () => { if (redis) await redis.quit(); if (db) await db.sequelize.close(); });
const integration = (name, action) => test(name, { skip: !url }, action);
integration('PostgreSQL serializes concurrent registrations at the account ceiling', async () => {
  process.env.PUBLIC_TRIAL_ENABLED = 'true'; process.env.TRIAL_MAX_ACCOUNTS = '1';
  const results = await Promise.allSettled([1, 2].map(i => db.sequelize.transaction(async transaction => {
    await policy.admitAccount(db, transaction);
    await db.User.create({ username: 'trial' + i, email: `trial${i}@test.invalid`, passwordHash: 'unused' }, { transaction });
  })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(await db.User.count(), 1);
});
integration('workspace ceiling cannot be bypassed by concurrent creates', async () => {
  const user = await db.User.findOne(); process.env.TRIAL_WORKSPACES_PER_ACCOUNT = '1';
  const results = await Promise.allSettled([1, 2].map(i => db.sequelize.transaction(async transaction => {
    await policy.admitWorkspace(db, user.id, transaction);
    await db.Team.create({ name: 'Trial', inviteCode: 'TRIAL' + i, createdBy: user.id }, { transaction });
  })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
});
integration('AI daily allowance is atomic and failed business transactions release their budget', async () => {
  process.env.TRIAL_AI_PER_DAY = '1';
  await assert.rejects(db.sequelize.transaction(async transaction => { await quotas.ai(db, 44, transaction); throw new Error('business rollback'); }));
  const results = await Promise.allSettled([1, 2].map(() => db.sequelize.transaction(transaction => quotas.ai(db, 44, transaction))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await db.TrialUsage.findOne({ where: { userId: 44 } })).requests, 1);
});
integration('storage lock prevents simultaneous physical writes from exceeding global quota', async () => {
  process.env.TRIAL_TOTAL_MIB = '1'; process.env.TRIAL_WORKSPACE_MIB = '1';
  const objects = [];
  const storage = { async *listObjectsV2() { yield* objects; } };
  const results = await Promise.allSettled([1, 2].map(i => db.sequelize.transaction(async transaction => {
    await quotas.check(db, storage, 'assets', 8, 700000, transaction);
    objects.push({ name: 'workspaces/8/' + i, size: 700000 });
  })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(objects.length, 1);
});
integration('Redis atomically bounds concurrent queue pushes without losing accepted jobs', async () => {
  process.env.TRIAL_AI_QUEUE_LIMIT = '1'; await redis.del('ai_jobs');
  const results = await Promise.allSettled([1, 2].map(i => quotas.enqueue(redis, { id: i })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(await redis.lLen('ai_jobs'), 1); await redis.del('ai_jobs');
});
