const express = require('express');
const router = express.Router();
const { uploadAsset, downloadAsset, deleteAsset, previewAsset, getAssetMetadata, updateAssetMetadata, addTagToAsset, removeTagFromAsset, getAssetTags, createVersion, uploadNewVersion, getVersionHistory, getVersion, downloadVersion, searchAssets, createAiJob, storeAiResult, createComment, getCommentHistory, getDashboardStats, getAssetInfo, getAssetDetails } = require("../controllers/assetsController");
const auth = require('../middleware/auth');
const { authorize } = require("../middleware/rbac");
const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const viewRoles = ['admin', 'developer', 'designer', 'collaborator'];
const manageRoles = ['admin', 'developer', 'designer'];


// POST /api/assets/upload
router.post('/upload', auth, authorize(...manageRoles), upload.single('asset'), uploadAsset);

// GET /api/assets/download/:id
router.get('/download/:id', auth, authorize(...viewRoles), downloadAsset);

// GET /api/assets/preview/:id
router.get('/preview/:id', auth, authorize(...viewRoles), previewAsset);

// GET /api/assets/:id/metadata
router.get('/:id/metadata', auth, authorize(...viewRoles), getAssetMetadata);

// PUT /api/assets/:id/metadata
router.put('/:id/metadata', auth, authorize(...manageRoles), updateAssetMetadata);

// Canonical tag mutation routes. Legacy /:tagId routes remain supported below.
router.post('/:assetId/tags', auth, authorize(...manageRoles), addTagToAsset);
router.delete('/:assetId/tags', auth, authorize(...manageRoles), removeTagFromAsset);

// POST /api/assets/:assetId/tags/:tagId
router.post('/:assetId/tags/:tagId', auth, authorize(...manageRoles), addTagToAsset);

// DELETE /api/assets/:assetId/tags/:tagId
router.delete('/:assetId/tags/:tagId', auth, authorize(...manageRoles), removeTagFromAsset);

// GET /api/assets/:assetId/tags
router.get('/:assetId/tags', auth, authorize(...viewRoles), getAssetTags);

// Version control routes
// POST /api/assets/:id/versions
router.post('/:id/versions', auth, authorize(...manageRoles), createVersion);
// POST /api/assets/:id/versions/upload
router.post('/:id/versions/upload', auth, authorize(...manageRoles), upload.single('asset'), uploadNewVersion);
// GET /api/assets/:id/versions
router.get('/:id/versions', auth, authorize(...viewRoles), getVersionHistory);
// GET /api/assets/:id/versions/:versionId
router.get('/:id/versions/:versionId', auth, authorize(...viewRoles), getVersion);
// GET /api/assets/:id/versions/:versionId/download
router.get('/:id/versions/:versionId/download', auth, authorize(...viewRoles), downloadVersion);

// DELETE /api/assets/:id
router.delete('/:id', auth, authorize(...manageRoles), deleteAsset);

router.get('/search', auth, authorize(...viewRoles), searchAssets);




router.post('/ai/job', auth, authorize(...manageRoles), createAiJob);

//router.post('/:id/ai-result', auth, authorize('admin', 'developer', 'designer', 'collaborator'), storeAiResult);
router.post('/:id/ai-result', storeAiResult);

router.get('/:id/info',getAssetInfo);
router.get('/:id/details', auth, authorize(...viewRoles), getAssetDetails);


router.post('/:assetId/comments', auth, authorize(...viewRoles), createComment);
router.get('/:assetId/comments', auth, authorize(...viewRoles), getCommentHistory);

router.get('/dashboard/stats', auth, authorize(...viewRoles), getDashboardStats);

module.exports = router;


