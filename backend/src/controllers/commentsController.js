const { Asset, Comment, User } = require('../models');
const logger = require('../utils/logger');
const { belongsToWorkspace } = require('../utils/workspaceScope');

const DELETED_COMMENT_CONTENT = 'Comment deleted by author.';
const MAX_COMMENT_LENGTH = 2000;

function normalizedContent(content) {
  return typeof content === 'string' ? content.trim() : '';
}

function publicComment(record) {
  const value = typeof record?.toJSON === 'function' ? record.toJSON() : { ...record };
  const { asset: _asset, ...comment } = value;
  const parent = comment.parent
    ? {
        ...comment.parent,
        content: comment.parent.isDeleted ? DELETED_COMMENT_CONTENT : comment.parent.content
      }
    : null;

  return {
    ...comment,
    content: comment.isDeleted ? DELETED_COMMENT_CONTENT : comment.content,
    parent
  };
}

function canManageComment(req, comment) {
  return req.user.teamRole === 'owner' || Number(comment.userId) === Number(req.user.id);
}

async function findCommentInWorkspace(id, user) {
  const comment = await Comment.findByPk(id, {
    include: [
      { model: Asset, as: 'asset', attributes: ['id', 'workspaceId'] },
      { model: User, as: 'author', attributes: ['id', 'username'] },
      { model: Comment, as: 'parent', attributes: ['id', 'content', 'isDeleted'] }
    ]
  });

  if (!comment || !belongsToWorkspace(comment.asset, user)) return null;
  return comment;
}

exports.createComment = async (req, res) => {
  try {
    const { assetId } = req.params;
    const content = normalizedContent(req.body.content);
    const { parentId } = req.body;

    if (!content) return res.status(400).json({ message: 'Content is required' });
    if (content.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({ message: `Content must be ${MAX_COMMENT_LENGTH} characters or fewer` });
    }

    const asset = await Asset.findByPk(assetId);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });

    if (parentId) {
      const parentComment = await Comment.findOne({ where: { id: parentId, assetId: asset.id } });
      if (!parentComment) {
        return res.status(400).json({ message: 'Parent comment does not belong to this asset' });
      }
    }

    const comment = await Comment.create({
      content,
      assetId: asset.id,
      userId: req.user.id,
      parentId: parentId || null,
      isDeleted: false
    });

    const fullComment = await Comment.findByPk(comment.id, {
      include: [
        { model: User, as: 'author', attributes: ['id', 'username'] },
        { model: Comment, as: 'parent', attributes: ['id', 'content', 'isDeleted'] }
      ]
    });

    return res.status(201).json({ message: 'Comment created successfully', comment: publicComment(fullComment) });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getCommentHistory = async (req, res) => {
  try {
    const { assetId } = req.params;
    const pageNum = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 10));
    const offset = (pageNum - 1) * limit;

    const asset = await Asset.findByPk(assetId);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });

    const { count, rows } = await Comment.findAndCountAll({
      where: { assetId: asset.id },
      include: [
        { model: User, as: 'author', attributes: ['id', 'username'] },
        { model: Comment, as: 'parent', attributes: ['id', 'content', 'isDeleted'] }
      ],
      offset,
      limit,
      order: [['createdAt', 'ASC']]
    });

    return res.json({
      totalItems: count,
      totalPages: Math.ceil(count / limit),
      currentPage: pageNum,
      pageSize: limit,
      comments: rows.map(publicComment)
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.updateComment = async (req, res) => {
  try {
    const content = normalizedContent(req.body.content);
    if (!content) return res.status(400).json({ message: 'Content is required' });
    if (content.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({ message: `Content must be ${MAX_COMMENT_LENGTH} characters or fewer` });
    }

    const comment = await findCommentInWorkspace(req.params.id, req.user);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    if (comment.isDeleted) return res.status(409).json({ message: 'Deleted comments cannot be edited' });
    if (!canManageComment(req, comment)) {
      return res.status(403).json({ message: 'Forbidden: You may edit only your own comments' });
    }

    comment.content = content;
    if (typeof comment.changed === 'function') comment.changed('content', true);
    await comment.save();

    return res.json({ message: 'Comment updated successfully', comment: publicComment(comment) });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const comment = await findCommentInWorkspace(req.params.id, req.user);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    if (!canManageComment(req, comment)) {
      return res.status(403).json({ message: 'Forbidden: You may delete only your own comments' });
    }

    if (!comment.isDeleted) {
      comment.isDeleted = true;
      await comment.save();
    }

    return res.json({ message: 'Comment deleted successfully', comment: publicComment(comment) });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.DELETED_COMMENT_CONTENT = DELETED_COMMENT_CONTENT;
exports.publicComment = publicComment;
