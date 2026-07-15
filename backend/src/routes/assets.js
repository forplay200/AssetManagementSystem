const express = require('express');
const router = express.Router();
const { uploadAsset, downloadAsset, deleteAsset, previewAsset, getAssetMetadata, updateAssetMetadata, addTagToAsset, removeTagFromAsset, getAssetTags, createVersion, uploadNewVersion, getVersionHistory, getVersion, downloadVersion, searchAssets, createAiJob, storeAiResult, createComment, getCommentHistory, getDashboardStats, getAssetInfo, getAssetDetails } = require("../controllers/assetsController");
const auth = require('../middleware/auth');
const { authorizePermission } = require("../middleware/rbac");
const requireWorkspace = require('../middleware/requireWorkspace');
const workspaceAssetAccess = require('../middleware/workspaceAssetAccess');
const internalAiAuth = require('../middleware/internalAiAuth');
const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const workspaceAuth = [auth, requireWorkspace];
// POST /api/assets/upload
router.post('/upload', workspaceAuth, authorizePermission('uploadAsset'), upload.single('asset'), uploadAsset);

// GET /api/assets/download/:id
router.get('/download/:id', workspaceAuth, authorizePermission('downloadAsset'), workspaceAssetAccess, downloadAsset);

// GET /api/assets/preview/:id
router.get('/preview/:id', workspaceAuth, authorizePermission('viewAsset'), workspaceAssetAccess, previewAsset);

// GET /api/assets/:id/metadata
router.get('/:id/metadata', workspaceAuth, authorizePermission('viewAsset'), workspaceAssetAccess, getAssetMetadata);

// PUT /api/assets/:id/metadata
router.put('/:id/metadata', workspaceAuth, authorizePermission('manageMetadata'), workspaceAssetAccess, updateAssetMetadata);

// Canonical tag mutation routes. Legacy /:tagId routes remain supported below.
router.post('/:assetId/tags', workspaceAuth, authorizePermission('manageMetadata'), workspaceAssetAccess, addTagToAsset);
router.delete('/:assetId/tags', workspaceAuth, authorizePermission('manageMetadata'), workspaceAssetAccess, removeTagFromAsset);

// POST /api/assets/:assetId/tags/:tagId
router.post('/:assetId/tags/:tagId', workspaceAuth, authorizePermission('manageMetadata'), workspaceAssetAccess, addTagToAsset);

// DELETE /api/assets/:assetId/tags/:tagId
router.delete('/:assetId/tags/:tagId', workspaceAuth, authorizePermission('manageMetadata'), workspaceAssetAccess, removeTagFromAsset);

// GET /api/assets/:assetId/tags
router.get('/:assetId/tags', workspaceAuth, authorizePermission('viewAsset'), workspaceAssetAccess, getAssetTags);

// Version control routes
// POST /api/assets/:id/versions
router.post('/:id/versions', workspaceAuth, authorizePermission('manageVersions'), workspaceAssetAccess, createVersion);
// POST /api/assets/:id/versions/upload
router.post('/:id/versions/upload', workspaceAuth, authorizePermission('manageVersions'), workspaceAssetAccess, upload.single('asset'), uploadNewVersion);
// GET /api/assets/:id/versions
router.get('/:id/versions', workspaceAuth, authorizePermission('viewAsset'), workspaceAssetAccess, getVersionHistory);
// GET /api/assets/:id/versions/:versionId
router.get('/:id/versions/:versionId', workspaceAuth, authorizePermission('viewAsset'), workspaceAssetAccess, getVersion);
// GET /api/assets/:id/versions/:versionId/download
router.get('/:id/versions/:versionId/download', workspaceAuth, authorizePermission('downloadAsset'), workspaceAssetAccess, downloadVersion);

// DELETE /api/assets/:id
router.delete('/:id', workspaceAuth, authorizePermission('deleteAsset'), workspaceAssetAccess, deleteAsset);

router.get('/search', workspaceAuth, authorizePermission('viewAsset'), searchAssets);




router.post('/ai/job', workspaceAuth, authorizePermission('manageMetadata'), workspaceAssetAccess, createAiJob);

//router.post('/:id/ai-result', auth, authorize('admin', 'developer', 'designer', 'collaborator'), storeAiResult);
router.post('/:id/ai-result', internalAiAuth, storeAiResult);

// Internal AI worker compatibility endpoint. The worker uses this before it can
// post generated metadata, so its existing service-to-service contract remains unchanged.
router.get('/:id/info', internalAiAuth, getAssetInfo);
router.get('/:id/details', workspaceAuth, authorizePermission('viewAsset'), workspaceAssetAccess, getAssetDetails);


router.post('/:assetId/comments', workspaceAuth, authorizePermission('comment'), workspaceAssetAccess, createComment);
router.get('/:assetId/comments', workspaceAuth, authorizePermission('viewAsset'), workspaceAssetAccess, getCommentHistory);

router.get('/dashboard/stats', workspaceAuth, authorizePermission('viewAsset'), getDashboardStats);

module.exports = router;


