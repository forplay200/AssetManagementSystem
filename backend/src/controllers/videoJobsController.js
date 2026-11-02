const { Asset, AssetAiJob, Version, sequelize } = require('../models');
const jobs = require('../services/assetAiJobs');
const { canManageAsset, ASSET_WRITE_DENIED } = require('../utils/assetPermissions');
const { minioClient, BUCKET_NAME } = require('../utils/minioClient');
const logger = require('../utils/logger');
const handle = action => async (req, res) => {
  try {
    if (req.params.jobId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.jobId)) throw Object.assign(new Error('Invalid video job ID.'), { status: 400 });
    await action(req, res);
  } catch (error) {
    if (!error.status) logger.error(error);
    if (!res.headersSent) res.status(error.status || 500).json({ message: error.status ? error.message : 'Video analysis could not be completed.' });
  }
};
exports.current = handle(async (req, res) => {
  const asset = await Asset.findByPk(req.params.id);
  if (!asset) throw Object.assign(new Error('Asset not found.'), { status: 404 });
  const job = asset.currentAiJobId ? await AssetAiJob.findByPk(asset.currentAiJobId) : null;
  const value = jobs.publicJob(job);
  if (value?.candidates.some(c => c.tagId)) {
    const ids = new Set((await asset.getTags()).map(t => t.id));
    value.candidates = value.candidates.map(c => c.tagId ? { ...c, tagLinked: ids.has(c.tagId) } : c);
  }
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ job: value });
});
exports.frame = handle(async (req, res) => {
  const asset = await Asset.findByPk(req.params.id);
  if (!asset) throw Object.assign(new Error('Asset not found.'), { status: 404 });
  const job = await AssetAiJob.findByPk(req.params.jobId);
  if (!job || String(job.assetId) !== String(asset.id) || job.workspaceId !== asset.workspaceId) throw Object.assign(new Error('Frame not found.'), { status: 404 });
  if (asset.currentAiJobId !== job.id) {
    const versions = await Version.findAll({ where: { assetId: asset.id } });
    if (!versions.some(v => v.metadata?.videoJobId === job.id)) throw Object.assign(new Error('Analysis was replaced.'), { status: 409 });
  }
  const frame = job.output?.frames.find(f => f.id === req.params.frameId);
  if (!frame || job.status !== 'succeeded') throw Object.assign(new Error('Frame not found.'), { status: 404 });
  const stream = await minioClient.getObject(BUCKET_NAME, frame.key);
  res.set({ 'Content-Type': 'image/jpeg', 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store' });
  stream.on('error', error => res.destroy(error)); res.once('close', () => stream.destroy()); stream.pipe(res);
});
exports.review = handle(async (req, res) => res.json(await jobs.review(req.params.id, req.params.jobId, req.user, req.body.decisions)));
exports.claim = handle(async (req, res) => res.json(await jobs.claim(req.params.id, req.params.jobId, req.body.sourceFilename)));
exports.heartbeat = handle(async (req, res) => res.json(await jobs.heartbeat(req.params.id, req.params.jobId, req.body.leaseToken, req.body.stage)));
exports.result = handle(async (req, res) => res.json({ job: await jobs.complete(req.params.id, req.params.jobId, req.body.leaseToken, req.body) }));
exports.enqueue = async (req, res, assetId) => {
  const job = await sequelize.transaction(async transaction => {
    const asset = await Asset.findByPk(assetId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!asset) throw Object.assign(new Error('Asset not found.'), { status: 404 });
    if (!canManageAsset(req.user, asset)) throw Object.assign(new Error(ASSET_WRITE_DENIED), { status: 403 });
    if (!jobs.isVideo(asset)) throw Object.assign(new Error('The asset file changed. Reload it before starting video analysis.'), { status: 409 });
    return jobs.create(asset, req.user.id, transaction, req.body.regenerate === true);
  });
  await jobs.dispatch(job);
  res.status(201).json({ job: jobs.publicJob(job) });
};
