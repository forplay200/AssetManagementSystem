const path = require('path');
const { Op } = require('sequelize');
const { sequelize, Tag, User, Asset, Version, Comment, TeamMember, AssetAiJob } = require("../models");
const { canManageAsset, canDeleteAsset, ASSET_WRITE_DENIED } = require('../utils/assetPermissions');

const redisClient = require("../redisClient");
const logger = require('../utils/logger');
const { minioClient, BUCKET_NAME } = require('../utils/minioClient');
const { assetSearchOrder, buildAssetSearchWhere, findAiMatch } = require('../utils/searchQuery');
const { workspaceAssetWhere } = require('../utils/workspaceScope');
const { canonicalizeTagName, getVisualAssetType, getVocabularySnapshot, normalizeTagName } = require('../utils/clipVocabulary');

const crypto = require('crypto');
const sharp = require('sharp');
const packages = require('../utils/modelPackage');
const videoJobs = require('../services/assetAiJobs');
const edits = require('../services/assetEditSessions');
const quotas = require('../services/resourceQuota');
const quotaDb = () => require('../models');
const { beginDownload } = require('../services/downloadAudit');

const AI_TAG_FIELDS = ['imageTags', 'modelTags', 'semanticTags', 'audioTags', 'tags', 'keywords'];

function pendingAiSummary(asset) {
  const pending = asset.pendingAiResult;
  if (!pending) return null;
  const stale = pending.revision !== asset.revision || pending.filename !== asset.filename;
  const ai = stale ? null : pending.metadata?.ai;
  const tags = AI_TAG_FIELDS
    .flatMap(key => Array.isArray(ai?.[key]) ? ai[key].filter(tag => typeof tag === 'string' && tag.trim()) : []);
  const transcript = typeof ai?.transcript === 'string' && ai.transcript.trim() ? ai.transcript : undefined;
  const summary = typeof ai?.summary === 'string' && ai.summary.trim() ? ai.summary : undefined;
  const modelStats = ai?.type === '3d' ? {
    vertexCount: Number.isFinite(ai.vertexCount) ? ai.vertexCount : null,
    faceCount: Number.isFinite(ai.faceCount) ? ai.faceCount : null,
  } : undefined;
  return { createdAt: pending.createdAt, stale, tags: [...new Set(tags)], transcript, summary, modelStats };
}

function changeAiSuggestion(asset, tag, createdAt, replacement) {
  const suggestions = edits.enabled() && pendingAiSummary(asset);
  if (!suggestions || suggestions.stale || suggestions.createdAt !== createdAt || !suggestions.tags.includes(tag)) {
    throw edits.fail('AI_SUGGESTION_OUTDATED', 'This suggestion is no longer current. Refresh the suggestions and try again.');
  }
  const pending = asset.pendingAiResult;
  const ai = { ...pending.metadata.ai };
  for (const key of AI_TAG_FIELDS) {
    if (!Array.isArray(ai[key]) || !ai[key].includes(tag)) continue;
    ai[key] = replacement === null
      ? ai[key].filter(value => value !== tag)
      : [...new Set(ai[key].map(value => value === tag ? replacement : value))];
  }
  asset.pendingAiResult = { ...pending, metadata: { ...pending.metadata, ai } };
}

function keepCurrentSuggestionsAfterTagChange(asset) {
  const pending = asset.pendingAiResult;
  if (edits.enabled() && pending && pending.revision === asset.revision && pending.filename === asset.filename) {
    asset.pendingAiResult = { ...pending, revision: asset.revision + 1 };
  }
}

function assetResponse(asset) {
  const governanceEnabled = edits.enabled();
  const aiRequest = asset.aiRequestContext;
  return { id: asset.id, filename: asset.filename, originalname: asset.originalname, displayName: asset.displayName ?? null,
    mimetype: asset.mimetype, size: asset.size, userId: asset.userId,
    workspaceId: asset.workspaceId, uploadedAt: asset.uploadedAt,
    governanceEnabled, revision: asset.revision, contentVersionId: asset.contentVersionId,
    fileSubmittedBy: asset.fileSubmittedBy ?? null, fileSubmittedAt: asset.fileSubmittedAt ?? null,
    pendingAiResult: governanceEnabled ? pendingAiSummary(asset) : null,
    aiProcessing: governanceEnabled && Boolean(aiRequest && aiRequest.revision === asset.revision && aiRequest.filename === asset.filename),
    media: asset.metadata?.media || null, currentAiJobId: asset.currentAiJobId || null,
    package: packages.packageSummary(asset.packageManifest) };
}
function versionResponse(version) {
  const value = typeof version.toJSON === 'function' ? version.toJSON() : { ...version };
  const { packageManifest, ...rest } = value;
  return { ...rest, package: packages.packageSummary(packageManifest) };
}

async function usernamesById(ids) {
  const userIds = [...new Set(ids.filter(id => id != null))];
  if (!userIds.length) return new Map();
  const users = await User.findAll({ where: { id: userIds }, attributes: ['id', 'username'] });
  return new Map(users.map(user => [user.id, user.username]));
}

async function versionsWithUsernames(versions) {
  const usernames = await usernamesById(versions.flatMap(version => [version.createdBy, version.submittedBy]));
  return versions.map(version => ({
    ...versionResponse(version),
    createdByName: usernames.get(version.createdBy) ?? null,
    submittedByName: usernames.get(version.submittedBy) ?? null
  }));
}

function reportUploadError(res, error) {
  logger.error(error);
  if (!res.headersSent) { res.removeHeader('Content-Disposition'); res.removeHeader('Content-Type'); }
  if (!res.headersSent) res.status(error.status || 500).json({
    message: error.status ? error.message : 'Server error',
    ...(error.code ? { code: error.code } : {}),
    ...(error.diagnostics ? { diagnostics: error.diagnostics } : {})
  });
}
async function queueAsset(asset) {
  if (videoJobs.isVideo(asset)) return { status: 'not-queued', message: 'AI allowance reached. Manual tagging is still available.' };
  let requestId;
  try {
    if (edits.enabled()) {
      requestId = await sequelize.transaction(async transaction => {
        const current = await Asset.findByPk(asset.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!current || current.lifecycleState !== 'active' || current.filename !== asset.filename) throw edits.fail('REVISION_CONFLICT', 'Asset changed before processing.');
        await quotas.ai(quotaDb(), asset.fileSubmittedBy || asset.userId, transaction);
        const id = crypto.randomUUID();
        current.aiRequestContext = { id, filename: current.filename, revision: current.revision };
        await current.save({ transaction }); return id;
      });
    }
    if (!edits.enabled()) await sequelize.transaction(transaction => quotas.ai(quotaDb(), asset.fileSubmittedBy || asset.userId, transaction));
    await quotas.enqueue(redisClient, { assetId: asset.id, jobType: 'auto_tag', requestId, createdAt: new Date().toISOString() });
    return { status: 'queued' };
  } catch (error) {
    logger.error(error);
    if (edits.enabled() && requestId) await require('../services/auditService').createAuditService(require('../models')).append({ workspaceId: asset.workspaceId, asset, action: 'asset.ai_failed', result: 'failed', initiatorId: asset.fileSubmittedBy || asset.userId, correlationId: requestId, details: { stage: 'queue', applied: false } }).catch(logger.error);
    return { status: 'queue-failed', message: error.status ? error.message : 'Files were saved. AI processing can be retried from the Metadata panel.' };
  }
}
async function preserveCurrent(asset, req, transaction, writtenKeys) {
  let fileName = asset.filename;
  // Video object keys are immutable. Snapshots own the same original, avoiding
  // abandoned copies when the current file is replaced while a job still refers to it.
  if (!asset.packageManifest && !videoJobs.isVideo(asset)) {
    fileName = 'versions/' + asset.id + '/' + crypto.randomUUID() + '/' + path.basename(asset.filename);
    writtenKeys.push(fileName);
    await quotas.check(quotaDb(), minioClient, BUCKET_NAME, asset.workspaceId, Number(asset.size), transaction);
    await minioClient.copyObject(BUCKET_NAME, fileName, '/' + BUCKET_NAME + '/' + asset.filename);
  }
  const versionNumber = (await Version.max('versionNumber', { where: { assetId: asset.id }, transaction }) || 0) + 1;
  const analysis = videoJobs.isVideo(asset) && asset.currentAiJobId ? await AssetAiJob.findByPk(asset.currentAiJobId, { transaction, lock: transaction.LOCK.UPDATE }) : null;
  return Version.create({ assetId: asset.id, versionNumber, fileName,
    originalName: asset.originalname, mimeType: asset.mimetype, size: asset.size,
    metadata: { ...(asset.metadata || {}), ...(videoJobs.isVideo(asset) ? { videoJobId: analysis?.status === 'succeeded' ? analysis.id : null } : {}) },
    packageManifest: asset.packageManifest || null, createdBy: req.user.id,
    changeLog: req.body.changeLog || 'Preserved before updating the current file', contentVersionId: asset.contentVersionId || null,
    submittedBy: asset.fileSubmittedBy ?? null, submittedAt: asset.fileSubmittedAt ?? null, baseContentVersionId: asset.baseContentVersionId || null }, { transaction });
}
async function streamFile(res, key, mime, name, disposition = 'inline') {
  const stream = await minioClient.getObject(BUCKET_NAME, key);
  res.setHeader('Content-Type', mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', disposition + "; filename*=UTF-8''" + encodeURIComponent(name));
  res.setHeader('Cache-Control', 'private, no-store');
  stream.on('error', error => { logger.error(error); if (!res.headersSent) res.status(500).json({ message: 'File streaming failed' }); else res.destroy(error); });
  res.once('close', () => stream.destroy());
  stream.pipe(res);
}


function workspaceAssetScope(req) {
  return workspaceAssetWhere(req.user);
}

// Create a new version for an asset
exports.createVersion = async (req, res) => {
  const writtenKeys = [];
  let committed = false;
  try {
    const version = await sequelize.transaction(async transaction => {
      const asset = await Asset.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!asset) throw Object.assign(new Error('Asset not found'), { status: 404 });
      if (!canManageAsset(req.user, asset)) throw Object.assign(new Error(ASSET_WRITE_DENIED), { status: 403 });
      await edits.guard(asset, req, transaction);
      const version = await preserveCurrent(asset, req, transaction, writtenKeys);
      await edits.finish(asset, req, transaction, 'asset.snapshot_created', req.auditBefore, { details: { versionId: version.id, versionNumber: version.versionNumber } });
      return version;
    });
    committed = true;
    res.status(201).json({ message: 'Version created successfully', version: versionResponse(version) });
  } catch (error) {
    if (!committed) try { await packages.removeObjects(writtenKeys); } catch (cleanupError) { logger.error(cleanupError); }
    reportUploadError(res, error);
  }
};

// Get version history for an asset
exports.getVersionHistory = async (req, res) => {
  try {
    const assetId = req.params.id;
    const asset = await Asset.findByPk(assetId);
    if (!asset) {
      return res.status(404).json({ message: 'Asset not found' });
    }
    const versions = await Version.findAll({
      where: { assetId: asset.id },
      order: [['versionNumber', 'ASC']],
      attributes: ['id', 'versionNumber', 'fileName', 'originalName', 'mimeType', 'size', 'createdAt', 'createdBy', 'changeLog', 'packageManifest', 'metadata', 'contentVersionId', 'baseContentVersionId', 'submittedBy', 'submittedAt']
    });
    res.json(await versionsWithUsernames(versions));
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get a specific version by ID
exports.getVersion = async (req, res) => {
  try {
    const { id, versionId } = req.params;
    const version = await Version.findOne({
      where: { id: versionId, assetId: id },
      attributes: ['id', 'versionNumber', 'fileName', 'originalName', 'mimeType', 'size', 'createdAt', 'createdBy', 'changeLog', 'packageManifest', 'metadata', 'contentVersionId', 'baseContentVersionId', 'submittedBy', 'submittedAt']
    });
    if (!version) {
      return res.status(404).json({ message: 'Version not found' });
    }
    const [result] = await versionsWithUsernames([version]);
    res.json(result);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Preview only the version's main file. Query parameters cannot turn this into a download or ZIP.
exports.previewVersion = async (req, res) => {
  try {
    const version = await Version.findOne({ where: { id: req.params.versionId, assetId: req.params.id } });
    if (!version) return res.status(404).json({ message: 'Version not found' });
    await streamFile(res, version.fileName, version.mimeType, version.originalName);
  } catch (error) { reportUploadError(res, error); }
};

// Download a specific version
exports.downloadVersion = async (req, res) => {
  let endDownload;
  try {
    const version = await Version.findOne({ where: { id: req.params.versionId, assetId: req.params.id } });
    if (!version) return res.status(404).json({ message: 'Version not found' });
    if (edits.enabled()) endDownload = await beginDownload(req, res, await Asset.findByPk(req.params.id), { versionId: version.id, versionNumber: version.versionNumber, contentVersionId: version.contentVersionId, format: version.packageManifest && req.query.main !== 'true' ? 'package' : 'file' });
    if (res.destroyed) return;
    if (version.packageManifest && req.query.main !== 'true') return await packages.streamPackage(res, version.packageManifest, version.originalName);
    await streamFile(res, version.fileName, version.mimeType, version.originalName, 'attachment');
  } catch (error) { if (endDownload) await endDownload('failed').catch(logger.error); reportUploadError(res, error); }
};
// Search assets with filtering and pagination
exports.searchAssets = async (req, res) => {
  try {
    const { 
      filename, 
      metadata, 
      aiTag,
      tags, 
      type, 
      date, 
      creator,
      q,
      sort,
      page = 1, 
      pageSize = 10 
    } = req.query;

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const size = Math.min(100, Math.max(1, parseInt(pageSize)));
    const offset = (pageNum - 1) * size;
    const limit = size;

    const where = buildAssetSearchWhere({ filename, metadata, aiTag, q, type, date });
    where[Op.and] = [...(where[Op.and] || []), workspaceAssetScope(req)];

    if (tags) {
      // Split comma-separated tags and match any
      const tagArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      if (tagArray.length > 0) {
        // We'll handle this in the include section below
      }
    }

    // Build include array for associations
    const include = [];

    if (tags) {
      const tagArray = tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag);

      if (tagArray.length > 0) {
        include.push({
          model: Tag,
          as: 'tags',
          where: {
            [Op.or]: tagArray.map(t => ({
              name: {
                [Op.iLike]: `%${t}%`
              }
            }))
          }
        });
      }
    }
    if (creator) {
      if (!isNaN(creator)) {
        // Treat as user ID
        include.push({
          model: User,
          as: 'uploader',
          where: { id: parseInt(creator) }
        });
      } else {
        // Treat as username substring match
        include.push({
          model: User,
          as: 'uploader',
          where: { username: { [Op.iLike]: `%${creator}%` } }
        });
      }
    }

    const order = assetSearchOrder(sort);
    // Use findAndCountAll for pagination with total count
    const result = await Asset.findAndCountAll({
      where: where,
      include: include,
      distinct: true, // To avoid duplicate assets due to joins
      limit: limit,
      offset: offset,
      order: order || assetSearchOrder('newest')
    });
    
    let rows = await Promise.all(result.rows.map(async asset => {
      const { packageManifest, ...value } = asset.toJSON();
      const job = videoJobs.isVideo(asset) && asset.currentAiJobId ? await AssetAiJob.findByPk(asset.currentAiJobId, { attributes: ['status'] }) : null;
      return { ...value, ...(job ? { processingStatus: job.status } : {}), package: packages.packageSummary(packageManifest) };
    }));
    const count = result.count;

    if (q) {
      rows = rows.map(asset => {
        const value = typeof asset.toJSON === 'function' ? asset.toJSON() : asset;
        return { ...value, ...findAiMatch(value.metadata, q) };
      });
      if (!order) rows.sort((a, b) => b.score - a.score);
    }


    res.json({
      totalItems: count,
      totalPages: Math.ceil(count / limit),
      currentPage: pageNum,
      pageSize: limit,
      data: rows
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create an AI job (enqueue to Redis queue)
exports.createAiJob = async (req, res) => {
  try {
    const { assetId, jobType } = req.body;
    if (!assetId || !jobType) {
      return res.status(400).json({ message: "assetId and jobType are required" });
    }
    // Optional: check if asset exists
    const asset = await Asset.findByPk(assetId);
    if (!asset) {
      return res.status(404).json({ message: "Asset not found" });
    }
    if (!canManageAsset(req.user, asset)) return res.status(403).json({ message: ASSET_WRITE_DENIED });
    if (videoJobs.isVideo(asset)) return await require('./videoJobsController').enqueue(req, res, assetId);
    if (edits.enabled()) {
      const job = await sequelize.transaction(async transaction => {
        const current = await Asset.findByPk(assetId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!current) throw edits.fail('NOT_FOUND', 'Asset not found.', 404);
        await edits.guard(current, req, transaction);
        await quotas.ai(quotaDb(), req.user.id, transaction);
        const requestId = crypto.randomUUID();
        current.aiRequestContext = { id: requestId, filename: current.filename, revision: current.revision, requestedBy: req.user.id };
        current.pendingAiResult = null;
        await current.save({ transaction });
        await require('../services/auditService').createAuditService(quotaDb()).append({
          workspaceId: current.workspaceId, asset: current, actor: req.auditActor,
          action: 'asset.ai_requested', details: { requestId }
        }, transaction);
        return { assetId: current.id, jobType, requestId };
      });
      try { await quotas.enqueue(redisClient, job); }
      catch (error) {
        await require('../services/auditService').createAuditService(require('../models')).append({ workspaceId: req.user.workspaceId, asset, actor: req.auditActor, action: 'asset.ai_failed', result: 'failed', correlationId: job.requestId, details: { stage: 'queue', applied: false } }).catch(logger.error);
        return res.status(201).json({ message: 'The request could not be queued. Try again.', status: 'queue-failed', job, editingSessionRetained: true });
      }
      return res.status(201).json({ message: 'AI suggestions requested. Apply them after processing.', job, editingSessionRetained: true });
    }
    // Prepare job data
    const job = {
      assetId,
      jobType,
      createdAt: new Date().toISOString(),
      // Optionally, add asset details if needed by the worker
      // For example, we could add the file path or metadata
    };
    // Push to Redis queue (we'll use a list as a queue)
    await sequelize.transaction(transaction => quotas.ai(quotaDb(), req.user.id, transaction));
    await quotas.enqueue(redisClient, job);
    res.status(201).json({ message: "AI job created", job });
  } catch (error) {
    logger.error(error);
    res.status(error.status || 500).json({ code: error.code, message: error.status ? error.message : 'Server error' });
  }
};

// Store AI job result (update asset metadata with AI-generated metadata)
exports.storeAiResult = async (req, res) => {
  try {
    const assetId = req.params.id;
    const { metadata } = req.body; // Expecting { metadata: { ... } }

    if (!metadata) {
      return res.status(400).json({ message: "Metadata is required" });
    }

    const asset = await sequelize.transaction(async transaction => {
    const asset = await Asset.findByPk(assetId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!asset) {
      throw Object.assign(new Error('Asset not found'), { status: 404 });
    }

    if (videoJobs.isVideo(asset) || metadata.ai?.type === 'video' || metadata.ai?.videoTags) throw Object.assign(new Error('Video results require a current job ID and processing lease.'), { status: 409 });


    if (metadata.ai?.clip?.sourceFilename && metadata.ai.clip.sourceFilename !== asset.filename) {
      throw Object.assign(new Error('The asset file changed while visual tagging was in progress. Queue tagging for the current file.'), { status: 409 });
    }
    if (edits.enabled()) {
      if (asset.lifecycleState !== 'active') throw edits.fail('ASSET_TRASHED', 'Asset is not active.');
      if (!metadata.ai || typeof metadata.ai !== 'object' || Array.isArray(metadata.ai)) throw edits.fail('INVALID_AI_RESULT', 'An AI suggestions object is required.', 400);
      const context = asset.aiRequestContext;
      if (!context || req.get('X-AI-Request-Id') !== context.id || context.filename !== asset.filename || context.revision !== asset.revision) throw edits.fail('REVISION_CONFLICT', 'This AI result is outdated. Request suggestions again.');
      asset.pendingAiResult = { metadata: { ai: metadata.ai }, filename: asset.filename, revision: asset.revision, createdAt: new Date().toISOString() };
      asset.aiRequestContext = null;
      await asset.save({ transaction });
      await require('../services/auditService').createAuditService(require('../models')).append({ workspaceId: asset.workspaceId, asset, action: 'asset.ai_suggestions_ready', initiatorId: context.requestedBy, details: { requestId: context.id, applied: false } }, transaction);
      return asset;
    }

    // Update the asset's metadata
    
    asset.metadata = {
      ...(asset.metadata || {}),
      ...metadata
    };

    await asset.save({ transaction });
    return asset;
    });

    res.json({ message: "AI result stored successfully", asset });
  } catch (error) { reportUploadError(res, error); }
};
// Get dashboard statistics
exports.getDashboardStats = async (req, res) => {
  try {
    const [totalAssets, totalUsers, totalComments, recentUploads, recentUsers] = await Promise.all([
      Asset.count({ where: workspaceAssetScope(req) }),
      TeamMember.count({ where: { teamId: req.user.workspaceId } }),
      Comment.count({ include: [{ model: Asset, as: 'asset', where: workspaceAssetScope(req), attributes: [] }] }),
      Asset.findAll({
        where: workspaceAssetScope(req),
        order: [['uploadedAt', 'DESC']],
        limit: 5,
        attributes: ['id', 'filename', 'originalname', 'displayName', 'uploadedAt'],
        include: [{
          model: User,
          as: 'uploader',
          attributes: ['id', 'username']
        }]
      }),
      User.findAll({
        include: [{ model: TeamMember, as: 'teamMemberships', where: { teamId: req.user.workspaceId }, attributes: [] }],
        order: [['createdAt', 'DESC']],
        limit: 5,
        attributes: ['id', 'username', 'email', 'createdAt']
      })
    ]);

    res.json({
      totalAssets,
      totalUsers,
      totalComments,
      recentUploads,
      recentUsers
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
}

exports.uploadAsset = async (req, res) => {
  const writtenKeys = [];
  let committed = false;
  try {
    const prepared = await packages.prepareUpload(req);
    const asset = await sequelize.transaction(async transaction => {
      const record = await Asset.create({ filename: 'pending/' + crypto.randomUUID(),
        path: 'pending', originalname: prepared.main.originalname, mimetype: prepared.main.mimetype,
        size: prepared.main.size, userId: req.user.id, workspaceId: req.user.workspaceId, teamId: req.user.workspaceId }, { transaction });
      await quotas.check(quotaDb(), minioClient, BUCKET_NAME, req.user.workspaceId, prepared.resources.reduce((sum, r) => sum + r.size, 0), transaction);
      const stored = await packages.persistUpload(prepared, req.user.workspaceId, record.id, writtenKeys);
      record.fileSubmittedBy = req.user.id;
      record.fileSubmittedAt = new Date();
      if (edits.enabled()) record.contentVersionId = crypto.randomUUID();
      record.filename = stored.filename; record.path = stored.filename; record.packageManifest = stored.manifest;
      if (req.videoMedia) record.metadata = { media: req.videoMedia };
      await record.save({ transaction });
      if (req.videoMedia) record.videoJob = await videoJobs.create(record, req.user.id, transaction);
      if (edits.enabled()) {
        const actor = await edits.service().actorFor(req.user, record, transaction);
        await require('../services/auditService').createAuditService(require('../models')).append({ workspaceId: record.workspaceId, asset: record, actor, action: 'asset.uploaded', after: { contentVersionId: record.contentVersionId }, details: { mediaType: record.mimetype } }, transaction);
      }
      return record;
    });
    committed = true;
    const processing = asset.videoJob ? (await videoJobs.dispatch(asset.videoJob), { jobId: asset.videoJob.id, status: asset.videoJob.status }) : await queueAsset(asset);
    res.status(201).json({ message: 'Asset uploaded successfully', asset: assetResponse(asset), processing });
  } catch (error) {
    if (!committed) try { await packages.removeObjects(writtenKeys); } catch (cleanupError) { logger.error(cleanupError); }
    reportUploadError(res, error);
  }
};



exports.downloadAsset = async (req, res) => {
  let endDownload;
  try {
    const asset = await Asset.findByPk(req.params.id);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    endDownload = await beginDownload(req, res, asset, { contentVersionId: asset.contentVersionId, format: asset.packageManifest && req.query.main !== 'true' ? 'package' : 'file' });
    if (res.destroyed) return;
    if (asset.packageManifest && req.query.main !== 'true') return await packages.streamPackage(res, asset.packageManifest, asset.originalname);
    await streamFile(res, asset.filename, asset.mimetype, asset.originalname, 'attachment');
  } catch (error) { if (endDownload) await endDownload('failed').catch(logger.error); reportUploadError(res, error); }
};

exports.deleteAsset = async (req, res) => {
  if (edits.enabled()) {
    try {
      const cycle = await require('../services/assetLifecycle').createLifecycleService(require('../models')).trash(req.params.id, req.user, edits.credentials(req), req.body?.reason);
      return res.json({ message: 'Asset moved to the recycle bin.', cycle });
    } catch (error) { return reportUploadError(res, error); }
  }
  try {
    let relatedJobs = [];
    await sequelize.transaction(async transaction => {
      const asset = await Asset.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!asset) throw Object.assign(new Error('Asset not found'), { status: 404 });
      if (!canDeleteAsset(req.user, asset)) throw Object.assign(new Error(ASSET_WRITE_DENIED), { status: 403 });
      await edits.guard(asset, req, transaction, { deletion: true });
      const versions = await Version.findAll({ where: { assetId: asset.id }, transaction });
      relatedJobs = await AssetAiJob.findAll({ where: { assetId: asset.id }, transaction, lock: transaction.LOCK.UPDATE });
      for (const job of relatedJobs) await job.update({ status: 'cancelled', finishedAt: new Date(), leaseExpiresAt: null }, { transaction });
      await packages.removeObjects([...packages.objectKeys(asset), ...versions.flatMap(packages.objectKeys), ...relatedJobs.map(job => job.sourceFilename)]);
      await Version.destroy({ where: { assetId: asset.id }, transaction });
      await asset.destroy({ transaction });
    });
    for (const job of relatedJobs) try { await videoJobs.cleanup(job); } catch (error) { logger.error(error); }
    res.json({ message: 'Asset deleted successfully' });
  } catch (error) { reportUploadError(res, error); }
};

exports.previewAsset = async (req, res) => {
  try {
    const asset = req.recycleBinAsset || await Asset.findByPk(req.params.id);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    await streamFile(res, asset.filename, asset.mimetype, asset.originalname);
  } catch (error) { reportUploadError(res, error); }
};

exports.getAssetMetadata = async (req, res) => {
  try {
    const { id } = req.params;

    const asset = await Asset.findByPk(id);

    if (!asset) {
      return res.status(404).json({
        message: "Asset not found"
      });
    }

    res.json({
      assetId: asset.id,
      filename: asset.originalname,
      metadata: asset.metadata || {}
    });

  } catch (error) {
    logger.error(error);

    res.status(500).json({
      message: "Server error"
    });
  }
};

exports.updateAssetMetadata = async (req, res) => {
  try {
    const { id } = req.params;
    const { metadata } = req.body;

    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return res.status(400).json({ message: 'Metadata must be an object.' });
    const asset = await sequelize.transaction(async transaction => {
      const record = await Asset.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!record) throw Object.assign(new Error('Asset not found'), { status: 404 });
      if (!canManageAsset(req.user, record)) throw Object.assign(new Error(ASSET_WRITE_DENIED), { status: 403 });
      await edits.guard(record, req, transaction);
      const { media: _media, videoJobId: _jobId, currentAiJobId: _currentJob, ...editable } = metadata;
      const { videoTags: _tags, ...editableAi } = editable.ai || {};
      if (editableAi.type === 'video') delete editableAi.type;
      record.metadata = { ...editable,
        ...(record.metadata?.media ? { media: record.metadata.media } : {}),
        ...(videoJobs.isVideo(record) ? { ai: record.metadata?.ai || { type: 'video', videoTags: [] } }
          : editable.ai ? { ai: editableAi } : {}) };
      await record.save({ transaction });
      await edits.finish(record, req, transaction, 'asset.metadata_changed', req.auditBefore);
      return record;
    });

    res.json({
      message: "Metadata updated successfully",
      metadata: asset.metadata
    });

  } catch (error) {
    logger.error(error);

    res.status(error.status || 500).json({ code: error.code, message: error.status ? error.message : 'Server error' });
  }
};

exports.addTagToAsset = async (req, res) => {
  try {
    const { assetId } = req.params;
    const { tag, suggestionCreatedAt, keepEditing } = req.body;

    if (typeof tag !== 'string' || !tag.trim() || normalizeTagName(tag).length > 80) {
      return res.status(400).json({
        message: "A tag of 1 to 80 characters is required"
      });
    }

    const result = await sequelize.transaction(async transaction => {
      const asset = await Asset.findByPk(assetId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!asset) throw Object.assign(new Error('Asset not found'), { status: 404 });
      if (!canManageAsset(req.user, asset)) throw Object.assign(new Error(ASSET_WRITE_DENIED), { status: 403 });
      await edits.guard(asset, req, transaction);
      if (suggestionCreatedAt !== undefined) changeAiSuggestion(asset, tag, suggestionCreatedAt, null);
      const canonicalName = await canonicalizeTagName(asset.workspaceId, tag);
      // Reuse legacy case variants without rewriting historical tags or their links.
      const existingTag = await Tag.findOne({
        where: { name: { [Op.iLike]: canonicalName.replace(/[\\%_]/g, '\\$&') } },
        order: [['id', 'ASC']], transaction
      });
      const tagRecord = existingTag || (await Tag.findOrCreate({ where: { name: canonicalName }, transaction }))[0];
      await asset.addTag(tagRecord, { transaction });
      keepCurrentSuggestionsAfterTagChange(asset);
      const edit = await edits.finish(asset, req, transaction, 'asset.tags_changed', req.auditBefore, { keepEditing: keepEditing === true });
      return { tag: tagRecord, ...edit };
    });
    res.json({ message: 'Tag added successfully', ...result });

  } catch (error) {
    logger.error(error);

    res.status(error.status || 500).json({ code: error.code, message: error.status ? error.message : 'Server error' });
  }
};

exports.removeTagFromAsset = async (req, res) => {
  try {
    const { tag, keepEditing } = req.body;
    if (typeof tag !== 'string' || !tag.trim()) return res.status(400).json({ message: 'Tag is required' });
    const edit = await sequelize.transaction(async transaction => {
      const asset = await Asset.findByPk(req.params.assetId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!asset) throw Object.assign(new Error('Asset not found'), { status: 404 });
      if (!canManageAsset(req.user, asset)) throw Object.assign(new Error(ASSET_WRITE_DENIED), { status: 403 });
      await edits.guard(asset, req, transaction);
      const tagRecord = await Tag.findOne({ where: { name: tag.trim() }, transaction });
      if (!tagRecord) throw Object.assign(new Error('Tag not found'), { status: 404 });
      await asset.removeTag(tagRecord, { transaction });
      if (videoJobs.isVideo(asset)) {
        asset.metadata = { ...asset.metadata, ai: { ...asset.metadata?.ai, videoTags: (asset.metadata?.ai?.videoTags || []).filter(t => t !== tagRecord.name) } };
        await asset.save({ transaction });
      }
      keepCurrentSuggestionsAfterTagChange(asset);
      return edits.finish(asset, req, transaction, 'asset.tags_changed', req.auditBefore, { keepEditing: keepEditing === true });
    });
    res.json({ message: 'Tag removed successfully', ...edit });
  } catch (error) { reportUploadError(res, error); }
};

exports.updateAiSuggestion = async (req, res) => {
  if (!edits.enabled()) return res.status(404).json({ message: 'Not enabled.' });
  const { tag, suggestionCreatedAt, replacement } = req.body || {};
  if (typeof tag !== 'string' || typeof suggestionCreatedAt !== 'string' ||
      (replacement !== null && (!normalizeTagName(replacement) || normalizeTagName(replacement).length > 80))) {
    return res.status(400).json({ message: 'Select a suggestion and enter a tag of 1 to 80 characters to rename it.' });
  }
  try {
    const result = await sequelize.transaction(async transaction => {
      const asset = await Asset.findByPk(req.params.assetId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!asset) throw edits.fail('NOT_FOUND', 'Asset not found.', 404);
      await edits.guard(asset, req, transaction);
      const nextTag = replacement === null ? null : replacement.trim();
      changeAiSuggestion(asset, tag, suggestionCreatedAt, nextTag);
      keepCurrentSuggestionsAfterTagChange(asset);
      return edits.finish(asset, req, transaction, 'asset.ai_reviewed', req.auditBefore, {
        keepEditing: true, details: { suggestion: tag, replacement: nextTag, decision: nextTag === null ? 'rejected' : 'edited' }
      });
    });
    res.json(result);
  } catch (error) { reportUploadError(res, error); }
};

exports.getAssetTags = async (req, res) => {
  try {
    const { assetId } = req.params;

    const asset = await Asset.findByPk(assetId);

    if (!asset) {
      return res.status(404).json({
        message: "Asset not found"
      });
    }

    const tags = await asset.getTags();

    res.json({
      assetId: asset.id,
      tags
    });

  } catch (error) {
    logger.error(error);

    res.status(500).json({
      message: "Server error"
    });
  }
};

exports.getAssetInfo = async (req, res) => {
  try {

    const asset = await Asset.findByPk(
      req.params.id
    );

    if (!asset) {
      return res.status(404).json({
        message: "Asset not found"
      });
    }

    if (edits.enabled() && asset.lifecycleState !== 'active') return res.status(410).json({ code: 'ASSET_TRASHED', message: 'Asset is not active.' });
    const assetType = getVisualAssetType(asset);
    res.json({
      id: asset.id,
      filename: asset.filename,
      originalname: asset.originalname, displayName: asset.displayName ?? null,
      mimetype: asset.mimetype,
      size: asset.size,
      workspaceId: asset.workspaceId,
      packageId: asset.packageManifest?.packageId || null,
      ...(assetType ? { clipVocabulary: await getVocabularySnapshot(asset.workspaceId, assetType) } : {})
    });

  } catch (error) {

    logger.error(error);

    res.status(500).json({
      message: "Server error"
    });
  }
};

// Upload a new current file while preserving the previous current file in history.
exports.uploadNewVersion = async (req, res) => {
  const writtenKeys = [];
  let committed = false;
  try {
    const result = await sequelize.transaction(async transaction => {
      const asset = await Asset.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!asset) throw Object.assign(new Error('Asset not found'), { status: 404 });
      if (!canManageAsset(req.user, asset)) throw Object.assign(new Error(ASSET_WRITE_DENIED), { status: 403 });
      await edits.guard(asset, req, transaction, { file: true });
      const prepared = await packages.prepareUpload(req, asset);
      const version = await preserveCurrent(asset, req, transaction, writtenKeys);
      await quotas.check(quotaDb(), minioClient, BUCKET_NAME, req.user.workspaceId, prepared.resources.reduce((sum, r) => sum + r.size, 0), transaction);
      const stored = await packages.persistUpload(prepared, req.user.workspaceId, asset.id, writtenKeys);
      const { ai: _staleAi, media: _staleMedia, videoJobId: _staleJob, ...preservedMetadata } = asset.metadata || {};
      await videoJobs.supersede(asset, transaction);
      asset.filename = stored.filename; asset.path = stored.filename;
      asset.originalname = prepared.main.originalname; asset.mimetype = prepared.main.mimetype;
      asset.size = prepared.main.size; asset.packageManifest = stored.manifest;
      asset.uploadedAt = new Date(); asset.metadata = { ...preservedMetadata, ...(req.videoMedia ? { media: req.videoMedia } : {}) };
      if (edits.enabled()) {
        asset.aiRequestContext = null;
        asset.pendingAiResult = null;
      } else {
        asset.fileSubmittedBy = req.user.id;
        asset.fileSubmittedAt = asset.uploadedAt;
      }
      await asset.save({ transaction });
      const job = req.videoMedia ? await videoJobs.create(asset, req.user.id, transaction) : null;
      await edits.finish(asset, req, transaction, 'asset.version_uploaded', req.auditBefore, { file: true, details: { preservedVersionId: version.id, versionNumber: version.versionNumber } });
      return { asset, version, job };
    });
    committed = true;
    // Old objects remain owned by the preserved version, including the full package.
    const processing = result.job ? (await videoJobs.dispatch(result.job), { jobId: result.job.id, status: result.job.status }) : await queueAsset(result.asset);
    res.status(201).json({ message: 'New asset version uploaded successfully',
      asset: assetResponse(result.asset), version: versionResponse(result.version), processing });
  } catch (error) {
    if (!committed) try { await packages.removeObjects(writtenKeys); } catch (cleanupError) { logger.error(cleanupError); }
    reportUploadError(res, error);
  }
};

exports.getAssetDetails = async (req, res) => {
  try {
    const asset = await Asset.findByPk(req.params.id);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    const usernames = await usernamesById([asset.fileSubmittedBy]);
    res.json({ ...assetResponse(asset), fileSubmittedByName: usernames.get(asset.fileSubmittedBy) ?? null });
  } catch (error) { reportUploadError(res, error); }
};

exports.applyAiSuggestions = async (req, res) => {
  try {
    if (!edits.enabled()) return res.status(404).json({ message: 'Not enabled.' });
    const asset = await sequelize.transaction(async transaction => {
      const current = await Asset.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!current) throw edits.fail('NOT_FOUND', 'Asset not found.', 404);
      await edits.guard(current, req, transaction);
      const pending = current.pendingAiResult;
      if (!pending || pending.revision !== current.revision || pending.filename !== current.filename) throw edits.fail('REVISION_CONFLICT', 'Suggestions are missing or outdated. Request them again.');
      current.metadata = { ...current.metadata, ai: pending.metadata.ai };
      current.pendingAiResult = null;
      await edits.finish(current, req, transaction, 'asset.ai_completed', req.auditBefore);
      return current;
    });
    res.json({ asset: assetResponse(asset), metadata: asset.metadata });
  } catch (error) { reportUploadError(res, error); }
};

// The workspace/asset middleware also protects every companion resource.
async function packageRecord(req) {
  if (req.recycleBinAsset) return req.recycleBinAsset;
  if (req.params.versionId) return Version.findOne({ where: { id: req.params.versionId, assetId: req.params.id } });
  return Asset.findByPk(req.params.id);
}
exports.getAssetPackage = async (req, res) => {
  try {
    const record = await packageRecord(req);
    if (!record) return res.status(404).json({ message: 'Asset or version not found' });
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ package: packages.publicManifest(record.packageManifest) });
  } catch (error) { reportUploadError(res, error); }
};
exports.getPackageResource = async (req, res) => {
  try {
    const record = await packageRecord(req);
    if (!record) return res.status(404).json({ message: 'Asset or version not found' });
    const file = record.packageManifest?.files.find(resource => resource.id === req.params.resourceId);
    if (req.query.packageId && req.query.packageId !== record.packageManifest?.packageId) return res.status(409).json({ message: 'The model package changed. Reload the preview.' });
    if (!file) return res.status(404).json({ message: 'Package resource not found' });
    if (file.kind === 'texture' && req.query.preview === 'true') {
      const image = sharp(await packages.readObject(file.objectKey), { limitInputPixels: 16777216 })
        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).png();
      res.setHeader('Content-Type', 'image/png'); res.setHeader('Cache-Control', 'private, no-store');
      image.on('error', error => { if (res.headersSent) res.destroy(error); else reportUploadError(res, error); });
      res.once('close', () => image.destroy()); image.pipe(res);
    } else await streamFile(res, file.objectKey, file.mime, file.path);
  } catch (error) { reportUploadError(res, error); }
};

exports.renameAsset = async (req, res) => {
  try {
    const asset = await sequelize.transaction(async transaction => {
    const asset = await Asset.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!asset) throw Object.assign(new Error('Asset not found'), { status: 404 });
    if (!canManageAsset(req.user, asset)) throw Object.assign(new Error(ASSET_WRITE_DENIED), { status: 403 });
    await edits.guard(asset, req, transaction);
    if (asset.displayName !== req.body.displayName) {
      asset.displayName = req.body.displayName;
      await asset.save({ fields: ['displayName'], transaction });
    }
    await edits.finish(asset, req, transaction, 'asset.renamed', req.auditBefore);
    return asset;
    });
    res.json({ asset: assetResponse(asset) });
  } catch (error) { reportUploadError(res, error); }
};
