const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { Sequelize, DataTypes } = require('sequelize');
const { buildAssetSearchWhere, findAiMatch } = require('../src/utils/searchQuery');

function postgresSearchSql(query) {
  const sequelize = new Sequelize('postgres://user:password@localhost/test', { logging: false });
  const Asset = sequelize.define('Asset', { metadata: DataTypes.JSON }, { tableName: 'Assets', timestamps: false });
  return sequelize.dialect.queryGenerator.selectQuery('Assets', { where: buildAssetSearchWhere(query) }, Asset);
}

test('filename search prioritizes the original upload name and retains storage-key compatibility', () => {
  const where = buildAssetSearchWhere({ filename: 'dashboard' });
  const alternatives = where[Op.and][0][Op.or];
  assert.equal(alternatives[0].originalname[Op.iLike], '%dashboard%');
  assert.equal(alternatives[1].filename[Op.iLike], '%dashboard%');
});

test('metadata and AI searches cast JSON expressions to text for PostgreSQL', () => {
  const where = buildAssetSearchWhere({ metadata: 'redis', q: 'postgresql' });
  const [metadataCondition, aiCondition] = where[Op.and];
  assert.equal(metadataCondition.attribute.type, 'TEXT');
  assert.equal(metadataCondition.attribute.val.fn, 'jsonb_path_query_array');
  assert.equal(aiCondition.attribute.type, 'TEXT');
  assert.equal(aiCondition.attribute.val.path, 'metadata.ai');
});

test('metadata text search extracts scalar values instead of serializing JSON keys', () => {
  for (const term of ['button', 'project one', 'UI', 'type']) {
    const sql = postgresSearchSql({ metadata: term });
    assert.match(sql, /jsonb_path_query_array/);
    assert.match(sql, /@\.type\(\) == "string"/);
    assert.match(sql, new RegExp(`ILIKE '%${term}%'`, 'i'));
    assert.doesNotMatch(sql, /CAST\("Asset"\."metadata" AS TEXT\)/);
  }
});

test('AI matching reports imageTags, semanticTags, modelTags, audioTags, keywords, transcript, and summary sources', () => {
  const metadata = { ai: {
    imageTags: ['dashboard interface'],
    semanticTags: ['car', 'vehicle', 'transportation'],
    modelTags: ['3d model', 'low-poly'],
    audioTags: ['speech', 'music'],
    keywords: ['redis queue'],
    transcript: 'PostgreSQL stores structured metadata.',
    summary: 'Overview of digital formats'
  } };

  assert.equal(findAiMatch(metadata, 'dashboard').matchSource, 'imageTags');
  assert.equal(findAiMatch(metadata, 'transportation').matchSource, 'semanticTags');
  assert.equal(findAiMatch(metadata, 'low-poly').matchSource, 'modelTags');
  assert.equal(findAiMatch(metadata, 'music').matchSource, 'audioTags');
  assert.equal(findAiMatch(metadata, 'redis').matchSource, 'keywords');
  assert.equal(findAiMatch(metadata, 'postgresql').matchSource, 'transcript');
  assert.equal(findAiMatch(metadata, 'digital formats').matchSource, 'summary');
});
