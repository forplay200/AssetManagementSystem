const policy = require('./trialPolicy');
const MiB = 1024 * 1024;
// All storage-producing transactions acquire this lock after the Asset lock.
// Listing actual objects includes trash, historical copies and crash leftovers.
async function usage(db, storage, bucket, workspaceId, transaction) {
  const keys = new Set(), jobPrefixes = [];
  const assets = await db.Asset.findAll({ where: { workspaceId }, transaction });
  const add = row => {
    for (const key of row.packageManifest?.files?.map(f => f.objectKey) || [row.filename || row.fileName]) if (key) keys.add(key);
  };
  for (const asset of assets) {
    add(asset);
    for (const version of await db.Version.findAll({ where: { assetId: asset.id }, transaction })) add(version);
  }
  for (const job of await db.AssetAiJob.findAll({ where: { workspaceId }, transaction })) {
    jobPrefixes.push(`video-jobs/${job.id}/`);
    for (const frame of job.output?.frames || []) if (frame.key) keys.add(frame.key);
  }
  let workspaceBytes = 0, totalBytes = 0;
  for await (const object of storage.listObjectsV2(bucket, '', true)) {
    totalBytes += object.size || 0;
    // Include package objects written before a failed transaction was cleaned up.
    if (keys.has(object.name) || jobPrefixes.some(prefix => object.name.startsWith(prefix)) || object.name.startsWith(`workspaces/${workspaceId}/`)) workspaceBytes += object.size || 0;
  }
  return { workspaceBytes, totalBytes, workspaceLimitBytes: policy.limit('TRIAL_WORKSPACE_MIB', 500) * MiB, totalLimitBytes: policy.limit('TRIAL_TOTAL_MIB', 20480) * MiB };
}
async function check(db, storage, bucket, workspaceId, bytes, transaction) {
  if (!policy.enabled()) return;
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw policy.fail('Storage size could not be verified.', 503);
  await policy.lock(db, transaction, 21051102);
  const value = await usage(db, storage, bucket, workspaceId, transaction);
  if (value.workspaceBytes + bytes > value.workspaceLimitBytes) throw policy.fail('Workspace storage is full. Historical versions and recycle-bin files also use storage.', 413);
  if (value.totalBytes + bytes > value.totalLimitBytes) throw policy.fail('Trial storage is full. New uploads are temporarily paused.', 413);
}
async function ai(db, userId, transaction) {
  if (!policy.enabled()) return;
  await policy.lock(db, transaction, 21051103);
  const day = new Date().toISOString().slice(0, 10);
  const [row] = await db.TrialUsage.findOrCreate({ where: { userId, day }, defaults: { requests: 0 }, transaction });
  if (row.requests >= policy.limit('TRIAL_AI_PER_DAY', 20)) throw policy.fail('Your daily AI allowance has been reached. Manual tagging is still available.');
  await row.increment('requests', { transaction });
}
async function enqueue(redis, payload) {
  if (!policy.enabled()) return redis.lPush('ai_jobs', JSON.stringify(payload));
  const result = await redis.eval("if redis.call('LLEN',KEYS[1]) >= tonumber(ARGV[1]) then return -1 end return redis.call('LPUSH',KEYS[1],ARGV[2])", { keys: ['ai_jobs'], arguments: [String(policy.limit('TRIAL_AI_QUEUE_LIMIT', 100)), JSON.stringify(payload)] });
  if (Number(result) === -1) throw policy.fail('AI is busy. Please retry later; your file is saved.', 503);
  return result;
}
module.exports = { usage, check, ai, enqueue };
