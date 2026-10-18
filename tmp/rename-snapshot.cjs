const db = require('/app/src/models');
const fs = require('fs');
const crypto = require('crypto');
const { minioClient, BUCKET_NAME } = require('/app/src/utils/minioClient');
async function snapshot() {
  const result = {};
  for (const table of ['Users', 'Teams', 'TeamMembers', 'Assets', 'Versions', 'Tags', 'Comments', 'ClipVocabularyEntries']) {
    const [rows] = await db.sequelize.query(`SELECT to_jsonb(t) ${table === 'Assets' ? "- 'displayName'" : ''} AS row FROM "${table}" t ORDER BY id`);
    result[table] = { count: rows.length, hash: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
  }
  const objects = [];
  for await (const object of minioClient.listObjectsV2(BUCKET_NAME, '', true)) objects.push({ name: object.name, size: object.size, etag: object.etag });
  result.storage = { count: objects.length, hash: crypto.createHash('sha256').update(JSON.stringify(objects.sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex') };
  return result;
}
(async () => {
  const result = await snapshot();
  if (process.argv[2] === 'compare') {
    require('assert/strict').deepEqual(result, JSON.parse(fs.readFileSync('/tmp/rename-baseline.json')));
    console.log('Original database records and MinIO object inventory unchanged:', JSON.stringify(result));
  } else { fs.writeFileSync('/tmp/rename-baseline.json', JSON.stringify(result)); console.log(JSON.stringify(result)); }
  await db.sequelize.close();
})().catch(error => { console.error(error); process.exit(1); });
