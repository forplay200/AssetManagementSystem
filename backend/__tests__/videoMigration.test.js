const { test } = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../migrations/20261101000000-add-video-assets');
const S = require('sequelize');
test('video migration preserves old fields, can repeat and creates the task table on fresh databases', async () => {
  for (const legacy of [true, false]) {
    const tables = legacy ? { Assets: { filename: {} }, Versions: { fileName: {} } } : {};
    const q = {
      showAllTables: async () => Object.keys(tables), describeTable: async t => tables[t],
      addColumn: async (t, k, v) => tables[t][k] = v,
      createTable: async (t, v) => tables[t] = v
    };
    await migration.up(q, S); await migration.up(q, S);
    assert.ok(tables.AssetAiJobs.id.primaryKey); assert.equal(tables.AssetAiJobs.assetId.allowNull, false);
    if (legacy) {
      assert.ok(tables.Assets.filename); assert.ok(tables.Versions.fileName);
      assert.equal(tables.Assets.currentAiJobId.allowNull, true); assert.equal(tables.Versions.metadata.allowNull, true);
    }
  }
});
