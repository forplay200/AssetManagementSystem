const { Op, cast, col, fn, json, literal, where: sqlWhere } = require('sequelize');

const METADATA_SCALAR_PATH = '$.** ? (@.type() == "string" || @.type() == "number" || @.type() == "boolean")';

const TYPE_MIME_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/gif'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/x-wav'],
  video: ['video/mp4', 'video/quicktime'],
  text: ['text/plain', 'text/javascript', 'application/javascript', 'application/json', 'application/xml', 'text/xml'],
  model: ['model/obj', 'model/fbx', 'model/gltf-binary']
};

const AI_FIELDS = [
  ['imageTags', 10],
  ['semanticTags', 10],
  ['modelTags', 9],
  ['audioTags', 9],
  ['keywords', 8],
  ['summary', 5],
  ['transcript', 1]
];

const containsText = (expression, value) => sqlWhere(
  cast(expression, 'TEXT'),
  { [Op.iLike]: `%${String(value).trim()}%` }
);

const metadataValuesExpression = () => fn(
  'jsonb_path_query_array',
  cast(col('Asset.metadata'), 'JSONB'),
  literal(`'${METADATA_SCALAR_PATH}'`)
);

function buildAssetSearchWhere({ filename, metadata, aiTag, q, type, date } = {}) {
  const conditions = [];

  if (filename?.trim()) {
    const pattern = `%${filename.trim()}%`;
    conditions.push({
      [Op.or]: [
        { originalname: { [Op.iLike]: pattern } },
        { filename: { [Op.iLike]: pattern } }
      ]
    });
  }

  if (metadata?.trim()) conditions.push(containsText(metadataValuesExpression(), metadata));

  [...new Set([aiTag, q].filter(value => value?.trim()).map(value => value.trim()))]
    .forEach(value => conditions.push(containsText(json('metadata.ai'), value)));

  if (TYPE_MIME_TYPES[type]) conditions.push({ mimetype: { [Op.in]: TYPE_MIME_TYPES[type] } });

  if (date) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    if (!Number.isNaN(start.getTime())) conditions.push({ uploadedAt: { [Op.between]: [start, end] } });
  }

  return conditions.length ? { [Op.and]: conditions } : {};
}

function findAiMatch(metadata, query) {
  const ai = metadata?.ai || {};
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return { matchSource: '', score: 0 };

  for (const [field, score] of AI_FIELDS) {
    const value = Array.isArray(ai[field]) ? ai[field].join(' ') : String(ai[field] || '');
    if (value.toLowerCase().includes(needle)) return { matchSource: field, score };
  }

  return { matchSource: '', score: 0 };
}

module.exports = { buildAssetSearchWhere, findAiMatch, TYPE_MIME_TYPES, METADATA_SCALAR_PATH };
