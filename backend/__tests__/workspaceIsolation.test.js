const test = require('node:test');
const assert = require('node:assert/strict');

let assetRecord;

function mockModule(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

mockModule('../src/models', {
  Asset: { async findByPk() { return assetRecord; } }
});
mockModule('../src/utils/logger', { error() {} });

const requireWorkspace = require('../src/middleware/requireWorkspace');
const workspaceAssetAccess = require('../src/middleware/workspaceAssetAccess');
const { workspaceAssetWhere, belongsToWorkspace } = require('../src/utils/workspaceScope');
const internalAiAuth = require('../src/middleware/internalAiAuth');
const { backfillKnownWorkspaceOwnership } = require('../src/utils/workspaceMigration');

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

test('requires a validated active workspace for asset APIs', () => {
  const res = response();
  let nextCalled = false;
  requireWorkspace({ user: { role: 'admin' } }, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
});

test('builds strict workspace query predicates without a global fallback', () => {
  assert.deepEqual(workspaceAssetWhere({ workspaceId: 4 }), { workspaceId: 4 });
  assert.equal(belongsToWorkspace({ workspaceId: 4 }, { workspaceId: 4 }), true);
  assert.equal(belongsToWorkspace({ workspaceId: 9 }, { workspaceId: 4 }), false);
  assert.equal(belongsToWorkspace({ workspaceId: null }, { workspaceId: 4 }), false);
});

test('allows an asset only inside the matching workspace', async () => {
  assetRecord = { id: 7, workspaceId: 4 };
  const res = response();
  let nextCalled = false;
  await workspaceAssetAccess({ params: { id: '7' }, user: { workspaceId: 4 } }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('blocks assets owned by another workspace', async () => {
  assetRecord = { id: 7, workspaceId: 4 };
  const res = response();
  await workspaceAssetAccess({ params: { id: '7' }, user: { workspaceId: 9 } }, res, () => {});
  assert.equal(res.statusCode, 403);
  assert.match(res.payload.message, /another workspace/i);
});

test('quarantines legacy assets without a workspace assignment', async () => {
  assetRecord = { id: 7, workspaceId: null };
  const res = response();
  await workspaceAssetAccess({ params: { id: '7' }, user: { workspaceId: 4 } }, res, () => {});
  assert.equal(res.statusCode, 403);
  assert.match(res.payload.message, /requires workspace assignment/i);
});

test('keeps AI callbacks available only to the configured worker', () => {
  const previous = process.env.AI_SERVICE_TOKEN;
  process.env.AI_SERVICE_TOKEN = 'worker-secret';
  try {
    let nextCalled = false;
    const validRes = response();
    internalAiAuth({ header: () => 'worker-secret' }, validRes, () => { nextCalled = true; });
    assert.equal(nextCalled, true);

    const invalidRes = response();
    internalAiAuth({ header: () => 'wrong-secret' }, invalidRes, () => {});
    assert.equal(invalidRes.statusCode, 403);
  } finally {
    if (previous === undefined) delete process.env.AI_SERVICE_TOKEN;
    else process.env.AI_SERVICE_TOKEN = previous;
  }
});

test('startup migration backfills only previously known ownership', async () => {
  let sql = '';
  const sequelize = {
    getQueryInterface: () => ({
      describeTable: async () => ({ workspaceId: {}, teamId: {} })
    }),
    query: async (statement) => { sql = statement; return [null, { rowCount: 3 }]; }
  };
  assert.equal(await backfillKnownWorkspaceOwnership(sequelize), 3);
  assert.match(sql, /"workspaceId" IS NULL AND "teamId" IS NOT NULL/);
});
