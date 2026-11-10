const crypto = require('node:crypto');
const { Op } = require('sequelize');
const sharp = require('sharp');
const db = require('../models');
const redis = require('../redisClient');
const { minioClient: storage, BUCKET_NAME: bucket } = require('../utils/minioClient');
const { getVocabularySnapshot, normalizeTagName, canonicalizeTagName } = require('../utils/clipVocabulary');
const logger = require('../utils/logger');
const ACTIVE = ['queued', 'processing'];
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const { isVideo, SAMPLING, LEGACY_SAMPLING, samplingTimes, TASK_SECONDS } = require('../utils/videoPolicy');

// Every mutation locks Asset before Job, including review and version replacement.
async function locked(assetId, jobId, action) {
  return db.sequelize.transaction(async transaction => {
    const asset = await db.Asset.findByPk(assetId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!asset) throw fail('Asset no longer exists.', 410);
    if (require('./assetEditSessions').enabled() && asset.lifecycleState !== 'active') throw fail('Asset is not active.', 410);
    const job = await db.AssetAiJob.findByPk(jobId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!job || String(job.assetId) !== String(assetId) || job.workspaceId !== asset.workspaceId) throw fail('Job not found.', 404);
    if (!isVideo(asset) || asset.currentAiJobId !== job.id || asset.filename !== job.sourceFilename) throw fail('This analysis was replaced by a newer file or task.');
    return action(asset, job, transaction);
  });
}
function validLease(job, token) {
  if (job.status !== 'processing' || !token || job.leaseToken !== token || new Date(job.leaseExpiresAt) <= new Date()
    || Date.now() - new Date(job.startedAt).getTime() > TASK_SECONDS * 1000) throw fail('The processing lease expired or was replaced.');
}
async function supersede(asset, transaction, status = 'superseded') {
  if (!asset.currentAiJobId) return;
  const old = await db.AssetAiJob.findByPk(asset.currentAiJobId, { transaction, lock: transaction.LOCK.UPDATE });
  if (old && ACTIVE.includes(old.status)) await old.update({ status, finishedAt: new Date(), leaseExpiresAt: null }, { transaction });
  asset.currentAiJobId = null;
}
async function create(asset, requestedBy, transaction, regenerate = false) {
  if (!isVideo(asset)) return null;
  if (!regenerate && asset.currentAiJobId) {
    const current = await db.AssetAiJob.findByPk(asset.currentAiJobId, { transaction, lock: transaction.LOCK.UPDATE });
    if (current && ACTIVE.includes(current.status) && current.sourceFilename === asset.filename) return current;
  }
  try { await require('./resourceQuota').ai(db, requestedBy, transaction); }
  catch (error) { if (!regenerate && error.status === 429) return null; throw error; }
  await supersede(asset, transaction);
  const vocabulary = await getVocabularySnapshot(asset.workspaceId, 'image');
  const job = await db.AssetAiJob.create({ id: crypto.randomUUID(), assetId: asset.id, workspaceId: asset.workspaceId,
    sourceFilename: asset.filename, requestedBy, jobType: 'video_visual_tags', status: 'queued', stage: 'waiting', attempt: 0,
    input: { vocabulary, model: 'openai/clip-vit-base-patch32', media: asset.metadata.media, size: asset.size,
      sampling: { ...SAMPLING }, processing: { deadlineSeconds: TASK_SECONDS },
      aggregation: { version: 'facet-max-v1', maxCandidates: 10, maxEvidence: 10,
        minimumSimilarity: Number(process.env.CLIP_IMAGE_MIN_SIMILARITY || 0.25), maximumScoreGap: Number(process.env.CLIP_MAX_SCORE_GAP || 0.04) } }
  }, { transaction });
  asset.currentAiJobId = job.id;
  asset.metadata = { ...asset.metadata, ai: { type: 'video', videoTags: [] } };
  await asset.save({ transaction });
  return job;
}
async function dispatch(job) {
  if (!job) return;
  try {
    // Avoid waiting forever for Redis's offline queue after a successful upload.
    if (redis.isReady === false) throw new Error('Queue unavailable');
    await require('./resourceQuota').enqueue(redis, { jobId: job.id, assetId: job.assetId, sourceFilename: job.sourceFilename, jobType: 'video_visual_tags' });
    await job.update({ dispatchedAt: new Date() });
  } catch (error) { logger.error(error); }
}
function publicJob(job) {
  if (!job) return null;
  const output = job.output || {};
  return { id: job.id, status: job.status, stage: job.stage, attempt: job.attempt,
    errorCode: job.errorCode, errorMessage: job.errorMessage, createdAt: job.createdAt, finishedAt: job.finishedAt,
    candidates: output.candidates || [], frames: (output.frames || []).map(({ key, ...f }) => f),
    sampling: output.sampling, provenance: output.provenance, elapsedSeconds: output.elapsedSeconds };
}
async function claim(assetId, jobId, sourceFilename) {
  return locked(assetId, jobId, async (_asset, job, transaction) => {
    if (job.sourceFilename !== sourceFilename || job.status !== 'queued' || job.attempt >= 3) throw fail('Job cannot be claimed.');
    await job.update({ status: 'processing', stage: 'downloading', attempt: job.attempt + 1, leaseToken: crypto.randomUUID(),
      leaseExpiresAt: new Date(Date.now() + 60000), startedAt: new Date(), errorCode: null, errorMessage: null }, { transaction });
    return { id: job.id, leaseToken: job.leaseToken, sourceFilename: job.sourceFilename, input: job.input };
  });
}
async function heartbeat(assetId, jobId, token, stage) {
  return locked(assetId, jobId, async (_asset, job, transaction) => {
    validLease(job, token);
    await job.update({ stage: ['downloading', 'extracting', 'tagging'].includes(stage) ? stage : job.stage,
      leaseExpiresAt: new Date(Date.now() + 60000) }, { transaction });
    return { status: job.status };
  });
}
function validateOutput(output, duration, policy = LEGACY_SAMPLING) {
  let requested;
  try { requested = samplingTimes(duration, policy); } catch { throw fail('Invalid sampling policy.', 400); }
  if (!output || !Array.isArray(output.candidates) || output.candidates.length > 10 || !Array.isArray(output.frames) || output.frames.length < 1 || output.frames.length > 10) throw fail('Invalid bounded video result.', 400);
  const frames = output.frames.map(f => {
    if (!f || !/^f(?:0|[1-9]\d?)$/.test(f.id) || Number(f.id.slice(1)) >= requested.length || !Number.isFinite(f.timeSeconds) || f.timeSeconds < 0 || f.timeSeconds > duration || typeof f.jpegBase64 !== 'string' || f.jpegBase64.length > 700000) throw fail('Invalid evidence frame.', 400);
    return { id: f.id, timeSeconds: f.timeSeconds, jpegBase64: f.jpegBase64 };
  });
  const ids = new Set(frames.map(f => f.id));
  if (ids.size !== frames.length || frames.reduce((sum, f) => sum + f.jpegBase64.length, 0) > 3 * 1024 * 1024) throw fail('Duplicate or oversized evidence frames.', 400);
  const s = output.sampling;
  if (!s || s.requestedCount !== requested.length || !Number.isInteger(s.decodedCount) || s.decodedCount < Math.ceil(s.requestedCount / 2) || s.decodedCount > s.requestedCount || !Array.isArray(s.times) || s.times.length !== s.decodedCount || s.times.some((t, i) => !Number.isFinite(t) || t < 0 || t > duration || (i > 0 && t <= s.times[i - 1]))) throw fail('Invalid sampling result.', 400);
  // v1 workers did not send the request-index mapping. v2 binds each actual
  // PTS and evidence ID to its immutable target bucket (small PTS print tolerance).
  let requestIndices;
  if (policy.version === 'midpoint-v2') {
    requestIndices = s.requestIndices;
    const step = duration / requested.length;
    if (!Array.isArray(requestIndices) || requestIndices.length !== s.decodedCount || requestIndices.some((index, i) =>
      !Number.isInteger(index) || index < 0 || index >= requested.length || (i > 0 && index <= requestIndices[i - 1]) ||
      (requested.length > 1 && (s.times[i] + 0.00002 < requested[index] || (index + 1 < requested.length && s.times[i] >= requested[index] + step + 0.00002))))) throw fail('Invalid sampling timestamps.', 400);
    if (frames.some(f => { const i = requestIndices.indexOf(Number(f.id.slice(1))); return i < 0 || f.timeSeconds !== s.times[i]; })) throw fail('Evidence does not match decoded sampling.', 400);
  } else if (frames.some(f => !s.times.includes(f.timeSeconds))) throw fail('Evidence does not match decoded sampling.', 400);
  const candidates = output.candidates.map((c, i) => {
    if (!c || typeof c.name !== 'string') throw fail('Invalid video suggestion.', 400);
    const name = normalizeTagName(c.name);
    if (!name || name.length > 80 || !Number.isFinite(c.maxScore) || c.maxScore < -1 || c.maxScore > 1 || !Number.isInteger(c.hitFrameCount) || c.hitFrameCount < 1 || c.hitFrameCount > s.decodedCount || !Array.isArray(c.frameIds) || !c.frameIds.length || c.frameIds.length > 2 || new Set(c.frameIds).size !== c.frameIds.length || c.frameIds.length > c.hitFrameCount || c.frameIds.some(id => !ids.has(id))) throw fail('Invalid video suggestion.', 400);
    return { id: 'c' + i, name, facet: String(c.facet || 'content').slice(0, 40), maxScore: c.maxScore,
      hitFrameCount: c.hitFrameCount, sampleCount: s.decodedCount, frameIds: [...new Set(c.frameIds)], decision: 'pending' };
  });
  if (new Set(candidates.map(c => c.name)).size !== candidates.length) throw fail('Duplicate suggestion.', 400);
  return { candidates, frames, sampling: { requestedCount: s.requestedCount, decodedCount: s.decodedCount, failedCount: s.requestedCount - s.decodedCount, times: s.times, ...(requestIndices ? { requestIndices } : {}) },
    elapsedSeconds: Number.isFinite(output.elapsedSeconds) ? output.elapsedSeconds : null,
    provenance: { model: 'openai/clip-vit-base-patch32', modelRevision: String(output.provenance?.modelRevision || '').slice(0, 120), scoreType: 'cosineSimilarity' } };
}
async function complete(assetId, jobId, token, payload) {
  const written = [];
  try {
    return await locked(assetId, jobId, async (_asset, job, transaction) => {
      if (job.status === 'succeeded' && job.leaseToken === token) return publicJob(job);
      validLease(job, token);
      if (payload.error) {
        const retryable = payload.retryable === true && job.attempt < 3;
        await job.update({ status: retryable ? 'queued' : 'failed', stage: retryable ? 'waiting' : 'failed',
          leaseExpiresAt: null, dispatchedAt: null, finishedAt: retryable ? null : new Date(),
          errorCode: 'VIDEO_PROCESSING_FAILED', errorMessage: 'Video analysis could not finish. You can retry or use manual tags.' }, { transaction });
        if (require('./assetEditSessions').enabled()) await require('./auditService').createAuditService(db).append({ workspaceId: _asset.workspaceId, asset: _asset, action: 'asset.ai_failed', result: 'failed', initiatorId: job.requestedBy, correlationId: job.id, details: { retryable, applied: false } }, transaction);
        return publicJob(job);
      }
      const output = validateOutput(payload.output, job.input.media.durationSeconds, job.input.sampling);
      const allowed = new Map(job.input.vocabulary.entries.map(e => [e.name, e.facet]));
      if (output.candidates.some(c => allowed.get(c.name) !== c.facet)) throw fail('Suggestion does not belong to the fixed vocabulary.', 400);
      // Re-encode evidence server-side; no caller-controlled storage paths or MIME types.
      for (const f of output.frames) {
        const image = await sharp(Buffer.from(f.jpegBase64, 'base64'), { limitInputPixels: 1048576 }).resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer({ resolveWithObject: true });
        const key = `video-jobs/${job.id}/${token}/${f.id}.jpg`; written.push(key);
        await require('./resourceQuota').check(db, storage, bucket, _asset.workspaceId, image.data.length, transaction);
        await storage.putObject(bucket, key, image.data, image.data.length, { 'Content-Type': 'image/jpeg' });
        delete f.jpegBase64; Object.assign(f, { key, mime: 'image/jpeg', width: image.info.width, height: image.info.height });
      }
      output.provenance = { ...output.provenance, vocabularyRevision: job.input.vocabulary.revision, vocabularyVersion: job.input.vocabulary.version,
        promptVersion: job.input.vocabulary.promptVersion, sampling: job.input.sampling, aggregation: job.input.aggregation, thresholdStatus: 'initial-unvalidated' };
      validLease(job, token);
      await job.update({ status: 'succeeded', stage: 'completed', output, leaseExpiresAt: null, finishedAt: new Date(), errorCode: null, errorMessage: null }, { transaction });
      if (require('./assetEditSessions').enabled()) await require('./auditService').createAuditService(db).append({ workspaceId: _asset.workspaceId, asset: _asset, action: 'asset.ai_suggestions_ready', initiatorId: job.requestedBy, correlationId: job.id, details: { applied: false, candidateCount: output.candidates.length } }, transaction);
      return publicJob(job);
    });
  } catch (error) {
    for (const key of written) try { await storage.removeObject(bucket, key); } catch (cleanupError) { logger.error(cleanupError); }
    throw error;
  }
}
async function review(assetId, jobId, user, decisions, request) {
  if (!Array.isArray(decisions) || !decisions.length || decisions.length > 10 || decisions.some(d => !d || typeof d !== 'object' || typeof d.candidateId !== 'string') || new Set(decisions.map(d => d.candidateId)).size !== decisions.length) throw fail('Choose 1–10 distinct suggestions.', 400);
  return locked(assetId, jobId, async (asset, job, transaction) => {
    const { canManageAsset, ASSET_WRITE_DENIED } = require('../utils/assetPermissions');
    if (!canManageAsset(user, asset)) throw fail(ASSET_WRITE_DENIED, 403);
    const edits = require('./assetEditSessions');
    await edits.guard(asset, request, transaction);
    if (job.status !== 'succeeded') throw fail('Suggestions are not ready for review.');
    const output = structuredClone(job.output);
    for (const d of decisions) {
      const c = output.candidates.find(c => c.id === d.candidateId);
      if (!c || !['accepted', 'edited', 'rejected', 'pending'].includes(d.decision)) throw fail('Invalid review decision.', 400);
      let finalText = ['accepted', 'edited'].includes(d.decision) ? normalizeTagName(d.decision === 'edited' ? d.text : c.name) : null;
      if (finalText !== null && (!finalText || finalText.length > 80)) throw fail('A tag of 1–80 characters is required.', 400);
      if (d.decision === 'edited') finalText = await canonicalizeTagName(asset.workspaceId, finalText);
      if (c.decision === d.decision && c.finalText === finalText) continue;
      if (c.decision !== 'pending' && !(c.decision === 'rejected' && d.decision === 'pending')) throw fail('This suggestion was already reviewed. Reload the results.');
      if (d.decision === 'pending' && c.decision !== 'rejected') throw fail('Only a rejection can be undone.');
      let tagId = null;
      if (finalText) {
        // Serialize tag creation across assets to avoid legacy case-sensitive duplicates.
        await db.sequelize.query('SELECT pg_advisory_xact_lock(:key)', { replacements: { key: 1447642196 }, transaction });
        const existing = await db.Tag.findOne({ where: { name: { [Op.iLike]: finalText.replace(/[\\%_]/g, '\\$&') } }, order: [['id', 'ASC']], transaction });
        const tag = existing || (await db.Tag.findOrCreate({ where: { name: finalText }, transaction }))[0];
        await asset.addTag(tag, { transaction }); tagId = tag.id;
      }
      Object.assign(c, { decision: d.decision, finalText, tagId, reviewedBy: user.id, reviewedAt: new Date().toISOString() });
    }
    const tags = await asset.getTags({ transaction });
    const names = new Map(tags.map(t => [t.id, t.name]));
    for (const c of output.candidates) if (c.tagId) c.tagLinked = names.has(c.tagId);
    await job.update({ output }, { transaction });
    asset.metadata = { ...asset.metadata, ai: { type: 'video', videoTags: [...new Set(output.candidates.filter(c => c.tagId && names.has(c.tagId)).map(c => names.get(c.tagId)))] } };
    await asset.save({ transaction });
    await edits.finish(asset, request, transaction, 'asset.ai_reviewed', request?.auditBefore);
    return { job: publicJob(job), metadata: asset.metadata, tags };
  });
}
async function cleanup(job) {
  // Tombstone jobs stay available to reject late callbacks. Only our private namespace is swept.
  const asset = await db.Asset.findByPk(job.assetId);
  const versions = await db.Version.findAll({ where: { assetId: job.assetId } });
  const referenced = asset?.currentAiJobId === job.id || versions.some(v => v.metadata?.videoJobId === job.id);
  const keep = referenced ? new Set((job.output?.frames || []).map(f => f.key)) : new Set();
  if (ACTIVE.includes(job.status) && asset?.currentAiJobId === job.id) return;
  for await (const object of storage.listObjectsV2(bucket, `video-jobs/${job.id}/`, true)) {
    if (!keep.has(object.name)) await storage.removeObject(bucket, object.name);
  }
}
let recovering = false;
async function recover() {
  if (recovering) return;
  recovering = true;
  try {
    const jobs = await db.AssetAiJob.findAll({ where: { status: { [Op.in]: ACTIVE } }, limit: 100, order: [['updatedAt', 'ASC']] });
    for (const job of jobs) {
      let next;
      try {
        next = await locked(job.assetId, job.id, async (_asset, current, transaction) => {
          if (current.status === 'processing' && (new Date(current.leaseExpiresAt) <= new Date() || Date.now() - new Date(current.startedAt) > TASK_SECONDS * 1000)) {
            await current.update({ status: current.attempt >= 3 ? 'failed' : 'queued', stage: 'waiting', leaseExpiresAt: null,
              dispatchedAt: null, errorCode: 'LEASE_EXPIRED', errorMessage: 'Processing was interrupted. Retry is available.',
              finishedAt: current.attempt >= 3 ? new Date() : null }, { transaction });
          }
          return current.status === 'queued' && (!current.dispatchedAt || Date.now() - new Date(current.dispatchedAt) > 60000) ? current : null;
        });
      } catch (error) {
        if ([409, 410].includes(error.status)) await job.update({ status: 'cancelled', leaseExpiresAt: null, finishedAt: new Date() }); else logger.error(error);
      }
      if (next) await dispatch(next);
    }
    // Bounded rotating sweep covers objects orphaned by a backend crash during result upload.
    const terminal = await db.AssetAiJob.findAll({ where: { status: { [Op.notIn]: ACTIVE } }, order: [['updatedAt', 'ASC']], limit: 20 });
    for (const job of terminal) { await cleanup(job); await job.update({ updatedAt: new Date() }); }
  } finally { recovering = false; }
}
function startRecovery() {
  const run = () => recover().catch(error => logger.error(error));
  run(); const timer = setInterval(run, 15000); timer.unref(); return timer;
}
module.exports = { ACTIVE, isVideo, locked, create, dispatch, claim, heartbeat, complete, review, publicJob, supersede, recover, startRecovery, cleanup, validateOutput };
