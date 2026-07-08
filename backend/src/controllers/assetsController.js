const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const { Tag, User, Asset, Version, Comment } = require("../models");

const redisClient = require("../redisClient");
const logger = require('../utils/logger');
const { minioClient, BUCKET_NAME } = require('../utils/minioClient');

// Create a new version for an asset
exports.createVersion = async (req, res) => {
  try {
    const assetId = req.params.id;
    const asset = await Asset.findByPk(assetId);
    if (!asset) {
      return res.status(404).json({ message: 'Asset not found' });
    }
    // Permission check: only the owner can create a version (or adjust as needed)
    if (asset.userId !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: You do not have permission to create a version for this asset' });
    }
    // Determine the next version number
    const versionCount = await Version.count({ where: { assetId: asset.id } });
    const versionNumber = versionCount + 1;
    // Create a version record with placeholder file info (we'll update after copying the file)
    const version = await Version.create({
      assetId: asset.id,
      versionNumber: versionNumber,
      fileName: '', // temporary
      originalName: '',
      mimeType: '',
      size: 0,
      createdBy: req.user.id,      changeLog: req.body.changeLog,
    });
    // Create directory for this version: uploads/versions/{assetId}/{version.id}
    const versionObjectKey =
  `versions/${asset.id}/${version.id}/${asset.filename}`;

    // 读取原始对象
    const stream = await minioClient.getObject(
      BUCKET_NAME,
      asset.filename
    );

    // 转 Buffer
    const chunks = [];

    await new Promise((resolve, reject) => {
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    const buffer = Buffer.concat(chunks);

    // 存为版本对象
    await minioClient.putObject(
      BUCKET_NAME,
      versionObjectKey,
      buffer,
      buffer.length,
      {
        'Content-Type': asset.mimetype
      }
    );

    // 更新 Version 记录
    version.fileName = versionObjectKey;
    version.originalName = asset.originalname;
    version.mimeType = asset.mimetype;
    version.size = asset.size;

    await version.save();
    // Return the version record
    res.status(201).json({
      message: 'Version created successfully',
      version: {
        id: version.id,
        assetId: version.assetId,
        versionNumber: version.versionNumber,
        fileName: version.fileName,
        originalName: version.originalName,
        mimeType: version.mimeType,
        size: version.size,
        createdAt: version.createdAt,     changeLog: version.changeLog,
        createdBy: version.createdBy
      }
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
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
    // Permission check: only the owner can view version history? We'll allow any authenticated user for now.
    // If you want to restrict to owner, uncomment the next line.
    // if (asset.userId !== req.user.id) {
    //   return res.status(403).json({ message: 'Forbidden: You do not have permission to view this asset' });
    // }
    const versions = await Version.findAll({
      where: { assetId: asset.id },
      order: [['versionNumber', 'ASC']],
      attributes: ['id', 'versionNumber', 'fileName', 'originalName', 'mimeType', 'size', 'createdAt', 'createdBy', 'changeLog']
    });
    res.json(versions);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get a specific version by ID
exports.getVersion = async (req, res) => {
  try {
    const { assetId, versionId } = req.params;
    const version = await Version.findOne({
      where: { id: versionId, assetId: assetId },
      attributes: ['id', 'versionNumber', 'fileName', 'originalName', 'mimeType', 'size', 'createdAt', 'createdBy', 'changeLog']
    });
    if (!version) {
      return res.status(404).json({ message: 'Version not found' });
    }
    // Permission check: only the owner can view the version? We'll allow any authenticated user for now.
    // If you want to restrict to owner, uncomment the next lines.
    // const asset = await Asset.findByPk(assetId);
    // if (asset.userId !== req.user.id) {
    //   return res.status(403).json({ message: 'Forbidden: You do not have permission to view this version' });
    // }
    res.json(version);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Download a specific version
exports.downloadVersion = async (req, res) => {
  try {
    const { id, versionId } = req.params;

    const version = await Version.findOne({
      where: {
        id: versionId,
        assetId: id
      }
    });

    if (!version) {
      return res.status(404).json({
        message: "Version not found"
      });
    }

    const stream = await minioClient.getObject(
      BUCKET_NAME,
      version.fileName
    );

    res.setHeader(
      "Content-Type",
      version.mimeType
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${version.originalName}"`
    );

    stream.on("error", (err) => {
      logger.error(err);

      if (!res.headersSent) {
        res.status(500).json({
          message: "Error streaming file"
        });
      }
    });

    stream.pipe(res);

  } catch (error) {
    logger.error(error);

    res.status(500).json({
      message: "Server error"
    });
  }
};
// Search assets with filtering and pagination
exports.searchAssets = async (req, res) => {
  try {
    const { 
      filename, 
      metadata, 
      tags, 
      type, 
      date, 
      creator,
      page = 1, 
      pageSize = 10 
    } = req.query;

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const size = Math.min(100, Math.max(1, parseInt(pageSize)));
    const offset = (pageNum - 1) * size;
    const limit = size;

    let where = {};

    if (filename) {
      where.filename = { [Op.like]: `%${filename}%` };
    }

    if (metadata) {
      // Search in JSON string representation (not efficient for large datasets)
      where.metadata = { [Op.like]: `%${metadata}%` };
    }

    if (tags) {
      // Split comma-separated tags and match any
      const tagArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      if (tagArray.length > 0) {
        // We'll handle this in the include section below
      }
    }

    if (type) {
      const typeMap = {
        image: ['image/jpeg', 'image/png', 'image/gif'],
        audio: ['audio/mpeg', 'audio/wav'],
        video: ['video/mp4', 'video/quicktime'],
        text: ['text/plain', 'application/json', 'text/xml'],
        model: ['model/obj', 'model/fbx', 'model/gltf-binary']
      };
      if (typeMap[type]) {
        where.mimetype = { [Op.in]: typeMap[type] };
      }
    }

    if (date) {
      const start = new Date(date + 'T00:00:00.000Z');
      const end = new Date(date + 'T23:59:59.999Z');
      where.uploadedAt = { [Op.between]: [start, end] };
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
                [Op.like]: `%${t}%`
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
          where: { username: { [Op.like]: `%${creator}%` } }
        });
      }
    }

    // Use findAndCountAll for pagination with total count
    const { count, rows } = await Asset.findAndCountAll({
      where: where,
      include: include,
      distinct: true, // To avoid duplicate assets due to joins
      limit: limit,
      offset: offset,
      order: [['uploadedAt', 'DESC']]
    });

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

    // Permission check: only the owner or admin can update the asset's metadata
    if (asset.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    }

    // Update the asset's metadata
    asset.metadata = metadata;
    await asset.save();

    res.json({ message: "AI result stored successfully", asset });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
// Create a comment (or reply) for an asset
exports.createComment = async (req, res) => {
  try {
    const { assetId } = req.params;
    const { content, parentId } = req.body;

    if (!content) {
      return res.status(400).json({ message: "Content is required" });
    }

    const asset = await Asset.findByPk(assetId);
    if (!asset) {
      return res.status(404).json({ message: "Asset not found" });
    }

    // If parentId is provided, verify it belongs to the same asset
    if (parentId) {
      const parentComment = await Comment.findByPk(parentId);
      if (!parentComment) {
        return res.status(400).json({ message: "Parent comment not found" });
      }
      if (parentComment.assetId !== asset.id) {
        return res.status(400).json({ message: "Parent comment does not belong to this asset" });
      }
    }

    const comment = await Comment.create({
      content,
      assetId: asset.id,
      userId: req.user.id,
      parentId: parentId || null
    });

    // Fetch the comment with author and possibly parent info for response
    const fullComment = await Comment.findByPk(comment.id, {
      include: [
        { model: User, as: 'author', attributes: ['id', 'username'] },
        { model: Comment, as: 'parent', attributes: ['id', 'content'] }
      ]
    });

    res.status(201).json({ message: "Comment created successfully", comment: fullComment });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get comment history for an asset
exports.getCommentHistory = async (req, res) => {
  try {
    const { assetId } = req.params;
    const { page = 1, pageSize = 10 } = req.query;

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page));
    const size = Math.min(100, Math.max(1, parseInt(pageSize)));
    const offset = (pageNum - 1) * size;
    const limit = size;

    const asset = await Asset.findByPk(assetId);
    if (!asset) {
      return res.status(404).json({ message: "Asset not found" });
    }

    const { count, rows } = await Comment.findAndCountAll({
      where: { assetId: asset.id },
      include: [
        { model: User, as: 'author', attributes: ['id', 'username'] },
        { model: Comment, as: 'parent', attributes: ['id', 'content'] }
      ],
      offset: offset,
      limit: limit,
      order: [['createdAt', 'ASC']] // oldest first
    });

    res.json({
      totalItems: count,
      totalPages: Math.ceil(count / limit),
      currentPage: pageNum,
      pageSize: limit,
      comments: rows
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get dashboard statistics
exports.getDashboardStats = async (req, res) => {
  try {
    const [totalAssets, totalUsers, totalComments, recentUploads, recentUsers] = await Promise.all([
      Asset.count(),
      User.count(),
      Comment.count(),
      Asset.findAll({
        order: [['uploadedAt', 'DESC']],
        limit: 5,
        attributes: ['id', 'filename', 'uploadedAt'],
        include: [{
          model: User,
          as: 'uploader',
          attributes: ['id', 'username']
        }]
      }),
      User.findAll({
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
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const { originalname, mimetype, size, buffer } = req.file;
    const ext = path.extname(originalname);
    const objectKey = Date.now() + "-" + Math.round(Math.random() * 1E9) + ext;
    await minioClient.putObject(BUCKET_NAME, objectKey, buffer, size, {
      'Content-Type': mimetype
    });
    const asset = await Asset.create({
      filename: objectKey,
      originalname: originalname,
      mimetype: mimetype,
      size: size,
      path: objectKey,
      userId: req.user.id
    });
    res.status(201).json({ message: "Asset uploaded successfully", asset });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: "Server error" });
  }
};


exports.downloadAsset = async (req, res) => {
  try {
    const { id } = req.params;

    const asset = await Asset.findByPk(id);

    if (!asset) {
      return res.status(404).json({
        message: "Asset not found"
      });
    }

    const stream = await minioClient.getObject(
      BUCKET_NAME,
      asset.filename
    );

    res.setHeader(
      "Content-Type",
      asset.mimetype
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asset.originalname}"`
    );

    stream.on("error", (err) => {
      logger.error(err);

      if (!res.headersSent) {
        res.status(500).json({
          message: "Error streaming file"
        });
      }
    });

    stream.pipe(res);

  } catch (error) {
    logger.error(error);

    res.status(500).json({
      message: "Server error"
    });
  }
};

exports.deleteAsset = async (req, res) => {
  try {
    const { id } = req.params;

    const asset = await Asset.findByPk(id);

    if (!asset) {
      return res.status(404).json({
        message: "Asset not found"
      });
    }

    // 权限检查
    if (
      asset.userId !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        message: "Forbidden"
      });
    }

    try {
      await minioClient.removeObject(
        BUCKET_NAME,
        asset.filename
      );
    } catch (minioError) {
      logger.error(minioError);

      return res.status(500).json({
        message: "Failed to remove file from storage"
      });
    }

    await asset.destroy();

    res.json({
      message: "Asset deleted successfully"
    });

  } catch (error) {
    logger.error(error);

    res.status(500).json({
      message: "Server error"
    });
  }
};

exports.previewAsset = async (req, res) => {
  try {
    const { id } = req.params;

    const asset = await Asset.findByPk(id);

    if (!asset) {
      return res.status(404).json({
        message: "Asset not found"
      });
    }

    const stream = await minioClient.getObject(
      BUCKET_NAME,
      asset.filename
    );

    res.setHeader(
      "Content-Type",
      asset.mimetype
    );

    res.setHeader(
      "Content-Disposition",
      `inline; filename="${asset.originalname}"`
    );

    stream.on("error", (err) => {
      logger.error(err);

      if (!res.headersSent) {
        res.status(500).json({
          message: "Error streaming preview"
        });
      }
    });

    stream.pipe(res);

  } catch (error) {
    logger.error(error);

    res.status(500).json({
      message: "Server error"
    });
  }
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

    if (
      asset.userId !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        message: "Forbidden"
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

    const [tagRecord] = await Tag.findOrCreate({
      where: {
        name: tag.trim()
      }
    });

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
