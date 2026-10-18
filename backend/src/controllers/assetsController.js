const path = require('path');
const { Op } = require('sequelize');
const { sequelize, Tag, User, Asset, Version, Comment, TeamMember } = require("../models");
const { canManageAsset, canDeleteAsset, ASSET_WRITE_DENIED } = require('../utils/assetPermissions');

const redisClient = require("../redisClient");
const logger = require('../utils/logger');
const { minioClient, BUCKET_NAME } = require('../utils/minioClient');
const { buildAssetSearchWhere, findAiMatch } = require('../utils/searchQuery');
const { workspaceAssetWhere } = require('../utils/workspaceScope');
const { canonicalizeTagName, getVisualAssetType, getVocabularySnapshot, normalizeTagName } = require('../utils/clipVocabulary');

const crypto = require('crypto');
const sharp = require('sharp');
const packages = require('../utils/modelPackage');

function assetResponse(asset) {
  return { id: asset.id, filename: asset.filename, originalname: asset.originalname, displayName: asset.displayName ?? null,
    mimetype: asset.mimetype, size: asset.size, userId: asset.userId,
    workspaceId: asset.workspaceId, uploadedAt: asset.uploadedAt,
    package: packages.packageSummary(asset.packageManifest) };
}
function versionResponse(version) {
  const value = typeof version.toJSON === 'function' ? version.toJSON() : { ...version };
  const { packageManifest, ...rest } = value;
  return { ...rest, package: packages.packageSummary(packageManifest) };
}
function reportUploadError(res, error) {
  logger.error(error);
  if (!res.headersSent) { res.removeHeader('Content-Disposition'); res.removeHeader('Content-Type'); }
  if (!res.headersSent) res.status(error.status || 500).json({
    message: error.status ? error.message : 'Server error',
    ...(error.diagnostics ? { diagnostics: error.diagnostics } : {})
  });
}
async function queueAsset(asset) {
  try {
    await redisClient.lPush('ai_jobs', JSON.stringify({ assetId: asset.id, jobType: 'auto_tag', createdAt: new Date().toISOString() }));
    return { status: 'queued' };
  } catch (error) {
    logger.error(error);
    return { status: 'queue-failed', message: 'Files were saved. AI processing can be retried from the Metadata panel.' };
  }
}
async function preserveCurrent(asset, req, transaction, writtenKeys) {
  let fileName = asset.filename;
  if (!asset.packageManifest) {
    fileName = 'versions/' + asset.id + '/' + crypto.randomUUID() + '/' + path.basename(asset.filename);
    writtenKeys.push(fileName);
    await minioClient.copyObject(BUCKET_NAME, fileName, '/' + BUCKET_NAME + '/' + asset.filename);
  }
  const versionNumber = (await Version.max('versionNumber', { where: { assetId: asset.id }, transaction }) || 0) + 1;
  return Version.create({ assetId: asset.id, versionNumber, fileName,
    originalName: asset.originalname, mimeType: asset.mimetype, size: asset.size,
    packageManifest: asset.packageManifest || null, createdBy: req.user.id,
    changeLog: req.body.changeLog || 'Preserved before updating the current file' }, { transaction });
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
      return preserveCurrent(asset, req, transaction, writtenKeys);
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
      attributes: ['id', 'versionNumber', 'fileName', 'originalName', 'mimeType', 'size', 'createdAt', 'createdBy', 'changeLog', 'packageManifest']
    });
    res.json(versions.map(versionResponse));
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
      attributes: ['id', 'versionNumber', 'fileName', 'originalName', 'mimeType', 'size', 'createdAt', 'createdBy', 'changeLog', 'packageManifest']
    });
    if (!version) {
      return res.status(404).json({ message: 'Version not found' });
    }
    res.json(versionResponse(version));
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Download a specific version
exports.downloadVersion = async (req, res) => {
  try {
    const version = await Version.findOne({ where: { id: req.params.versionId, assetId: req.params.id } });
    if (!version) return res.status(404).json({ message: 'Version not found' });
    if (version.packageManifest && req.query.main !== 'true') return await packages.streamPackage(res, version.packageManifest, version.originalName);
    await streamFile(res, version.fileName, version.mimeType, version.originalName, 'attachment');
  } catch (error) { reportUploadError(res, error); }
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

    // Use findAndCountAll for pagination with total count
    const result = await Asset.findAndCountAll({
      where: where,
      include: include,
      distinct: true, // To avoid duplicate assets due to joins
      limit: limit,
      offset: offset,
      order: [['uploadedAt', 'DESC']]
    });
    
    let rows = result.rows.map(asset => { const value = asset.toJSON(); const { packageManifest, ...rest } = value; return { ...rest, package: packages.packageSummary(packageManifest) }; });
    const count = result.count;

    if (q) {
      rows = rows.map(asset => {
        const value = typeof asset.toJSON === 'function' ? asset.toJSON() : asset;
        return { ...value, ...findAiMatch(value.metadata, q) };
      }).sort((a, b) => b.score - a.score);
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
    // Prepare job data
    const job = {
      assetId,
      jobType,
      createdAt: new Date().toISOString(),
      // Optionally, add asset details if needed by the worker
      // For example, we could add the file path or metadata
    };
    // Push to Redis queue (we'll use a list as a queue)
    await redisClient.lPush("ai_jobs", JSON.stringify(job));
    res.status(201).json({ message: "AI job created", job });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: "Server error" });
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

    const asset = await Asset.findByPk(assetId);
    if (!asset) {
      return res.status(404).json({ message: "Asset not found" });
    }


    if (metadata.ai?.clip?.sourceFilename && metadata.ai.clip.sourceFilename !== asset.filename) {
      return res.status(409).json({ message: 'The asset file changed while visual tagging was in progress. Queue tagging for the current file.' });
    }

    // Update the asset's metadata
    
    asset.metadata = {
      ...(asset.metadata || {}),
      ...metadata
    };

    await asset.save();

    res.json({ message: "AI result stored successfully", asset });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: "Server error" });
  }
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
      const stored = await packages.persistUpload(prepared, req.user.workspaceId, record.id, writtenKeys);
      record.filename = stored.filename; record.path = stored.filename; record.packageManifest = stored.manifest;
      await record.save({ transaction });
      return record;
    });
    committed = true;
    const processing = await queueAsset(asset);
    res.status(201).json({ message: 'Asset uploaded successfully', asset: assetResponse(asset), processing });
  } catch (error) {
    if (!committed) try { await packages.removeObjects(writtenKeys); } catch (cleanupError) { logger.error(cleanupError); }
    reportUploadError(res, error);
  }
};



exports.downloadAsset = async (req, res) => {
  try {
    const asset = await Asset.findByPk(req.params.id);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    if (asset.packageManifest && req.query.main !== 'true') return await packages.streamPackage(res, asset.packageManifest, asset.originalname);
    await streamFile(res, asset.filename, asset.mimetype, asset.originalname, 'attachment');
  } catch (error) { reportUploadError(res, error); }
};

exports.deleteAsset = async (req, res) => {
  try {
    const asset = await Asset.findByPk(req.params.id);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    if (!canDeleteAsset(req.user, asset)) return res.status(403).json({ message: ASSET_WRITE_DENIED });
    const versions = await Version.findAll({ where: { assetId: asset.id } });
    await packages.removeObjects([...packages.objectKeys(asset), ...versions.flatMap(packages.objectKeys)]);
    await sequelize.transaction(async transaction => {
      await Version.destroy({ where: { assetId: asset.id }, transaction });
      await asset.destroy({ transaction });
    });
    res.json({ message: 'Asset deleted successfully' });
  } catch (error) { reportUploadError(res, error); }
};

exports.previewAsset = async (req, res) => {
  try {
    const asset = await Asset.findByPk(req.params.id);
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

    const asset = await Asset.findByPk(id);

    if (!asset) {
      return res.status(404).json({
        message: "Asset not found"
      });
    }

    if (!canManageAsset(req.user, asset)) {
      return res.status(403).json({
        message: ASSET_WRITE_DENIED
      });
    }

    asset.metadata = metadata;

    await asset.save();

    res.json({
      message: "Metadata updated successfully",
      metadata: asset.metadata
    });

  } catch (error) {
    logger.error(error);

    res.status(500).json({
      message: "Server error"
    });
  }
};

exports.addTagToAsset = async (req, res) => {
  try {
    const { assetId } = req.params;
    const { tag } = req.body;

    if (typeof tag !== 'string' || !tag.trim() || normalizeTagName(tag).length > 80) {
      return res.status(400).json({
        message: "A tag of 1 to 80 characters is required"
      });
    }

    const asset = await Asset.findByPk(assetId);

    if (!asset) {
      return res.status(404).json({
        message: "Asset not found"
      });
    }

    if (!canManageAsset(req.user, asset)) {
      return res.status(403).json({ message: ASSET_WRITE_DENIED });
    }

    const canonicalName = await canonicalizeTagName(asset.workspaceId, tag);
    // Reuse legacy case variants without rewriting historical tags or their links.
    const existingTag = await Tag.findOne({
      where: { name: { [Op.iLike]: canonicalName.replace(/[\\%_]/g, '\\$&') } },
      order: [['id', 'ASC']]
    });
    const tagRecord = existingTag || (await Tag.findOrCreate({ where: { name: canonicalName } }))[0];

    await asset.addTag(tagRecord);

    res.json({
      message: "Tag added successfully",
      tag: tagRecord
    });

  } catch (error) {
    logger.error(error);

    res.status(500).json({
      message: "Server error"
    });
  }
};

exports.removeTagFromAsset = async (req, res) => {
  try {
    const { assetId } = req.params;
    const { tag } = req.body;

    if (!tag) {
      return res.status(400).json({
        message: "Tag is required"
      });
    }

    const asset = await Asset.findByPk(assetId);

    if (!asset) {
      return res.status(404).json({
        message: "Asset not found"
      });
    }

    if (!canManageAsset(req.user, asset)) {
      return res.status(403).json({ message: ASSET_WRITE_DENIED });
    }

    const tagRecord = await Tag.findOne({
      where: {
        name: tag.trim()
      }
    });

    if (!tagRecord) {
      return res.status(404).json({
        message: "Tag not found"
      });
    }

    await asset.removeTag(tagRecord);

    res.json({
      message: "Tag removed successfully"
    });

  } catch (error) {
    logger.error(error);

    res.status(500).json({
      message: "Server error"
    });
  }
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
      const prepared = await packages.prepareUpload(req, asset);
      const version = await preserveCurrent(asset, req, transaction, writtenKeys);
      const stored = await packages.persistUpload(prepared, req.user.workspaceId, asset.id, writtenKeys);
      const { ai: _staleAi, ...preservedMetadata } = asset.metadata || {};
      asset.filename = stored.filename; asset.path = stored.filename;
      asset.originalname = prepared.main.originalname; asset.mimetype = prepared.main.mimetype;
      asset.size = prepared.main.size; asset.packageManifest = stored.manifest;
      asset.uploadedAt = new Date(); asset.metadata = preservedMetadata;
      await asset.save({ transaction });
      return { asset, version };
    });
    committed = true;
    // Old objects remain owned by the preserved version, including the full package.
    const processing = await queueAsset(result.asset);
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
    res.json(assetResponse(asset));
  } catch (error) { reportUploadError(res, error); }
};

// The workspace/asset middleware also protects every companion resource.
async function packageRecord(req) {
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
    const asset = await Asset.findByPk(req.params.id);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    if (!canManageAsset(req.user, asset)) return res.status(403).json({ message: ASSET_WRITE_DENIED });
    if (asset.displayName !== req.body.displayName) {
      asset.displayName = req.body.displayName;
      await asset.save({ fields: ['displayName'] });
    }
    res.json({ asset: assetResponse(asset) });
  } catch (error) { logger.error(error); res.status(500).json({ message: 'Server error' }); }
};
