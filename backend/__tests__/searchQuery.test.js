const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { Sequelize, DataTypes } = require('sequelize');
const { assetSearchOrder, buildAssetSearchWhere, findAiMatch } = require('../src/utils/searchQuery');

test('Videos search includes MP4 and WebM', () => {
  assert.match(postgresSearchSql({ type: 'video' }), /video\/mp4/);
  assert.match(postgresSearchSql({ type: 'video' }), /video\/webm/);
});

function postgresSearchSql(query, order) {
  const sequelize = new Sequelize('postgres://user:password@localhost/test', { logging: false });
  const Asset = sequelize.define('Asset', { metadata: DataTypes.JSON }, { tableName: 'Assets', timestamps: false });
  return sequelize.dialect.queryGenerator.selectQuery('Assets', { where: buildAssetSearchWhere(query), order, limit: 12 }, Asset);
}

test('name search includes display name, original upload name and storage-key compatibility', () => {
  const where = buildAssetSearchWhere({ filename: 'dashboard' });
  const alternatives = where[Op.and][0][Op.or];
  assert.equal(alternatives[0].displayName[Op.iLike], '%dashboard%');
  assert.equal(alternatives[1].originalname[Op.iLike], '%dashboard%');
  assert.equal(alternatives[2].filename[Op.iLike], '%dashboard%');
});

test('filename search treats percent and underscore as literal filename characters', () => {
  const where = buildAssetSearchWhere({ filename: ' car_100% ' });
  const [condition] = where[Op.and];
  assert.equal(condition[Op.or][0].displayName[Op.iLike], '%car\\_100\\%%');
});

test('library sorts are applied before pagination and break ties by asset ID', () => {
  const name = postgresSearchSql({ type: 'model', filename: 'car' }, assetSearchOrder('name'));
  assert.match(name, /ILIKE '%car%'.*model\/obj/);
  assert.match(name, /ORDER BY lower\(coalesce\(nullif\("Asset"\."displayName", ''\), nullif\("Asset"\."originalname", ''\), "Asset"\."filename"\)\) ASC, "Asset"\."id" DESC LIMIT 12/);
  assert.match(postgresSearchSql({}, assetSearchOrder('size')), /ORDER BY "Asset"\."size" DESC, "Asset"\."id" DESC LIMIT 12/);
  assert.match(postgresSearchSql({}, assetSearchOrder('newest')), /ORDER BY "Asset"\."uploadedAt" DESC, "Asset"\."id" DESC LIMIT 12/);
  assert.equal(assetSearchOrder('filename DESC'), null);
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
