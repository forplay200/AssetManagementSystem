const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { Transform, pipeline } = require('stream');

const MB = 1024 * 1024;
const storage = {
  _handleFile(req, file, callback) {
    const filename = crypto.randomUUID();
    const target = path.join(req.uploadDirectory, filename);
    const limit = file.fieldname === 'asset' ? 50 * MB : file.fieldname === 'materials' ? 2 * MB : 10 * MB;
    let size = 0;
    const counter = new Transform({ transform(chunk, encoding, done) {
      size += chunk.length; req.uploadBytes = (req.uploadBytes || 0) + chunk.length;
      if (size > limit || req.uploadBytes > 100 * MB) return done(new Error(req.uploadBytes > 100 * MB ? 'The complete package exceeds 100 MB.' : file.originalname + ' exceeds its upload limit.'));
      done(null, chunk);
    } });
    pipeline(file.stream, counter, fs.createWriteStream(target, { flags: 'wx' }), error => callback(error, { destination: req.uploadDirectory, filename, path: target, size }));
  },
  _removeFile(req, file, callback) { fs.unlink(file.path, callback); }
};
const parser = multer({ storage, limits: { fileSize: 50 * MB, files: 33, fields: 8, fieldSize: 128 * 1024 } })
  .fields([{ name: 'asset', maxCount: 1 }, { name: 'materials', maxCount: 32 }, { name: 'textures', maxCount: 32 }]);

module.exports = async function modelUpload(req, res, next) {
  try {
    req.uploadDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'aether-model-'));
    const clean = () => fs.promises.rm(req.uploadDirectory, { recursive: true, force: true }).catch(() => {});
    res.once('finish', clean);
    res.once('close', clean);
    parser(req, res, async error => {
      if (error) { await clean(); return res.status(400).json({ message: error.code === 'LIMIT_FILE_SIZE' ? 'A file exceeds the 50 MB upload limit.' : 'Upload rejected: ' + error.message }); }
      const files = Object.values(req.files || {}).flat();
      if (files.reduce((sum, file) => sum + file.size, 0) > 100 * MB) {
        await clean(); return res.status(400).json({ message: 'The complete model package exceeds 100 MB.' });
      }
      req.file = req.files?.asset?.[0];
      next();
    });
  } catch (error) { next(error); }
};
