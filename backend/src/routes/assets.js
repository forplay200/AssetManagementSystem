const express = require('express');
const router = express.Router();
const { uploadAsset, downloadAsset, deleteAsset, previewAsset, getAssetMetadata, updateAssetMetadata, addTagToAsset, removeTagFromAsset, getAssetTags, createVersion, getVersionHistory, getVersion, downloadVersion, searchAssets, createAiJob, storeAiResult, createComment, getCommentHistory, getDashboardStats, getAssetInfo } = require("../controllers/assetsController");
const auth = require('../middleware/auth');
const { authorize } = require("../middleware/rbac");
const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


// POST /api/assets/upload
router.post('/upload', auth, authorize('admin', 'developer', 'designer', 'collaborator'), upload.single('asset'), uploadAsset);

// GET /api/assets/download/:id
router.get('/download/:id', auth, authorize('admin', 'developer', 'designer', 'collaborator'), downloadAsset);

// GET /api/assets/preview/:id
router.get('/preview/:id', auth, authorize('admin', 'developer', 'designer', 'collaborator'), previewAsset);

// GET /api/assets/:id/metadata
router.get('/:id/metadata', auth, authorize('admin', 'developer', 'designer', 'collaborator'), getAssetMetadata);

// PUT /api/assets/:id/metadata
router.put('/:id/metadata', auth, authorize('admin', 'developer', 'designer', 'collaborator'), updateAssetMetadata);

// POST /api/assets/:assetId/tags/:tagId
router.post('/:assetId/tags/:tagId', auth, authorize('admin', 'developer', 'designer', 'collaborator'), addTagToAsset);

// DELETE /api/assets/:assetId/tags/:tagId
router.delete('/:assetId/tags/:tagId', auth, authorize('admin', 'developer', 'designer', 'collaborator'), removeTagFromAsset);

// GET /api/assets/:assetId/tags
router.get('/:assetId/tags', auth, authorize('admin', 'developer', 'designer', 'collaborator'), getAssetTags);

// Version control routes
// POST /api/assets/:id/versions
router.post('/:id/versions', auth, authorize('admin', 'developer', 'designer', 'collaborator'), createVersion);
// GET /api/assets/:id/versions
router.get('/:id/versions', auth, authorize('admin', 'developer', 'designer', 'collaborator'), getVersionHistory);
// GET /api/assets/:id/versions/:versionId
router.get('/:id/versions/:versionId', auth, authorize('admin', 'developer', 'designer', 'collaborator'), getVersion);
// GET /api/assets/:id/versions/:versionId/download
router.get('/:id/versions/:versionId/download', auth, authorize('admin', 'developer', 'designer', 'collaborator'), downloadVersion);

// DELETE /api/assets/:id
router.delete('/:id', auth, authorize('admin', 'developer', 'designer', 'collaborator'), deleteAsset);

router.get('/search', auth, authorize('admin', 'developer', 'designer', 'collaborator'), searchAssets);




router.post('/ai/job', auth, authorize('admin', 'developer', 'designer', 'collaborator'), createAiJob);

//router.post('/:id/ai-result', auth, authorize('admin', 'developer', 'designer', 'collaborator'), storeAiResult);
router.post('/:id/ai-result', storeAiResult);

router.get('/:id/info',getAssetInfo);


router.post('/:assetId/comments', auth, authorize('admin', 'developer', 'designer', 'collaborator'), createComment);
router.get('/:assetId/comments', auth, authorize('admin', 'developer', 'designer', 'collaborator'), getCommentHistory);

router.get('/dashboard/stats', auth, authorize('admin', 'developer', 'designer', 'collaborator'), getDashboardStats);

module.exports = router;


