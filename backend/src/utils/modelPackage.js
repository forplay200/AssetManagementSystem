const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const yazl = require('yazl');
const { minioClient, BUCKET_NAME } = require('./minioClient');
const refs = require('./modelReferences');

const MB = 1024 * 1024;
const SUPPORTED = new Set(['png', 'jpg', 'jpeg', 'gif', 'mp3', 'wav', 'fbx', 'obj', 'cs', 'js', 'txt', 'json', 'xml']);
function badRequest(message, diagnostics) { return Object.assign(new Error(message), { status: 400, diagnostics }); }
function safePath(value) {
  const name = String(value || '').replace(/\\/g, '/');
  if (!name || name.length > 240 || /^[a-z]:|^\//i.test(name) || /[\x00-\x1f<>:"|?*]/.test(name) || name.split('/').some(p => !p || p === '.' || p === '..')) {
    throw badRequest('Use a relative file path without parent directories: ' + name);
  }
  return name;
}
function parseJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { throw badRequest('Invalid model package data.'); }
}
async function readObject(key) {
  const stream = await minioClient.getObject(BUCKET_NAME, key);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(file);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

async function prepareUpload(req, currentAsset) {
  const reuse = req.body.reuseSource === 'true';
  if (reuse && !currentAsset) throw badRequest('An existing asset is required to reuse its model.');
  if (reuse && req.file) throw badRequest('Choose either a replacement model or reuse the current model.');
  if (!req.file && !reuse) throw badRequest('A main asset file is required.');
  if (currentAsset && req.body.expectedFilename && req.body.expectedFilename !== currentAsset.filename) throw Object.assign(new Error('The current asset changed. Reload it before updating.'), { status: 409 });
  const main = req.file || { originalname: currentAsset.originalname, mimetype: currentAsset.mimetype, size: currentAsset.size, objectKey: currentAsset.filename };
  if (req.file && req.body.sourceName) main.originalname = path.basename(safePath(req.body.sourceName));
  const format = refs.extension(main.originalname);
  if (!SUPPORTED.has(format)) throw badRequest('Unsupported asset type: .' + format);
  if (main.size > 50 * MB) throw badRequest('The main file exceeds 50 MB.');
  const model = ['obj', 'fbx'].includes(format);
  if (model) main.mimetype = format === 'obj' ? 'model/obj' : 'model/fbx';
  const specifications = parseJson(req.body.resourcePaths, []);
  const bindings = parseJson(req.body.bindings, {});
  if (!Array.isArray(specifications) || specifications.some(spec => !spec || typeof spec !== 'object') || typeof bindings !== 'object' || !bindings || Array.isArray(bindings)) throw badRequest('Invalid resource paths or bindings.');
  const attachments = [...(req.files?.materials || []), ...(req.files?.textures || [])];
  if (attachments.length > 32) throw badRequest('A model package supports up to 32 companion files.');
  if (!model && (reuse || attachments.length)) throw badRequest('Companion files are supported only for OBJ and FBX models.');
  if (format === 'fbx' && req.files?.materials?.length) throw badRequest('MTL files are used with OBJ, not FBX.');
  const resources = [{ id: 'main', path: safePath(path.basename(main.originalname.replace(/\\/g, '/'))), kind: 'source', size: main.size, mime: main.mimetype, diskPath: main.path, objectKey: main.objectKey }];
  let texturePixels = 0;
  for (const field of ['materials', 'textures']) {
    for (const [index, file] of (req.files?.[field] || []).entries()) {
      const spec = specifications.find(s => s.field === field && s.index === index) || {};
      const filePath = safePath(spec.path || path.basename(file.originalname.replace(/\\/g, '/')));
      const id = spec.id || crypto.randomUUID();
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || resources.some(r => r.id === id)) throw badRequest('Duplicate or invalid resource ID.');
      if (resources.some(r => r.path.toLowerCase() === filePath.toLowerCase())) throw badRequest('Duplicate file path: ' + filePath + '. Give the files different relative paths.');
      const ext = refs.extension(filePath);
      const kind = field === 'materials' ? 'material' : 'texture';
      let mime = file.mimetype;
      if (kind === 'material') {
        if (ext !== 'mtl' || file.size > 2 * MB) throw badRequest('Material files must be .mtl and no larger than 2 MB.');
        mime = 'text/plain';
      } else {
        if (!refs.IMAGE_EXTENSIONS.includes(ext) || file.size > 10 * MB) throw badRequest('Textures must be PNG/JPG/JPEG and no larger than 10 MB each.');
        let info;
        try { info = await sharp(file.path, { limitInputPixels: 16777216 }).metadata(); } catch { throw badRequest('Invalid image or image exceeds 16 million pixels: ' + filePath); }
        if (!['png', 'jpeg'].includes(info.format) || !info.width || !info.height || (info.pages || 1) > 1) throw badRequest('Unsupported texture image: ' + filePath);
        texturePixels += info.width * info.height;
        if (texturePixels > 67108864) throw badRequest('The model textures exceed the 64 million pixel budget.');
        mime = info.format === 'png' ? 'image/png' : 'image/jpeg';
      }
      resources.push({ id, path: filePath, kind, size: file.size, mime, diskPath: file.path });
    }
  }
  if (resources.reduce((sum, r) => sum + r.size, 0) > 100 * MB) throw badRequest('The complete package exceeds 100 MB.');
  if (model) {
    for (const resource of resources.filter(r => ['source', 'material'].includes(r.kind))) {
      const bytes = resource.diskPath ? await fs.promises.readFile(resource.diskPath) : await readObject(resource.objectKey);
      resource.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      if (resource.kind === 'material' || format === 'obj') resource.text = bytes.toString('utf8');
      else resource.bytes = bytes;
    }
    if (format === 'fbx') {
      let videos;
      try { videos = refs.inspectFbx(resources[0].bytes).videos; } catch (error) { throw badRequest(error.message); }
      for (const video of videos.filter(v => v.embedded && refs.IMAGE_EXTENSIONS.includes(refs.extension(v.reference)))) {
        let info;
        try {
          const content = typeof video.content === 'string' ? Buffer.from(video.content.replace(/\s/g, ''), 'base64') : video.content;
          info = await sharp(content, { limitInputPixels: 16777216 }).metadata();
        } catch { throw badRequest('Invalid or oversized embedded image: ' + video.reference); }
        if (!['png', 'jpeg'].includes(info.format) || !info.width || !info.height || (info.pages || 1) > 1) throw badRequest('Unsupported embedded image: ' + video.reference);
        texturePixels += info.width * info.height;
        if (texturePixels > 67108864) throw badRequest('Embedded and external images exceed the 64 million pixel budget.');
      }
    }
  }
  const diagnostics = model ? refs.inspectPackage(resources, bindings) : null;
  const mode = req.body.geometryOnly === 'true' ? 'geometry' : 'materials';
  if (diagnostics?.issues.length && mode !== 'geometry') throw badRequest('Resolve the missing model resources, or explicitly choose geometry-only upload.', diagnostics);
  return { main, format, resources, diagnostics, mode, bindings, model };
}

async function persistUpload(prepared, workspaceId, assetId, writtenKeys) {
  const packageId = crypto.randomUUID();
  const prefix = prepared.model ? 'workspaces/' + workspaceId + '/assets/' + assetId + '/packages/' + packageId + '/source/' : '';
  const files = [];
  for (const resource of prepared.resources) {
    const key = prefix ? prefix + resource.id + '.' + refs.extension(resource.path) : packageId + '.' + prepared.format;
    // Include attempted writes in compensation in case a storage response fails.
    writtenKeys.push(key);
    let sha256;
    if (resource.diskPath) {
      sha256 = resource.sha256 || await hashFile(resource.diskPath);
      await minioClient.fPutObject(BUCKET_NAME, key, resource.diskPath, { 'Content-Type': resource.mime });
    } else {
      await minioClient.copyObject(BUCKET_NAME, key, '/' + BUCKET_NAME + '/' + resource.objectKey);
      sha256 = resource.sha256 || null;
    }
    files.push({ id: resource.id, path: resource.path, kind: resource.kind, objectKey: key, mime: resource.mime, size: resource.size, sha256 });
  }
  const manifest = prepared.model ? { schemaVersion: 1, packageId, format: prepared.format, mode: prepared.mode, files, bindings: prepared.bindings, diagnostics: prepared.diagnostics, totalSize: files.reduce((sum, f) => sum + f.size, 0), createdAt: new Date().toISOString() } : null;
  return { filename: files[0].objectKey, manifest };
}

function publicManifest(manifest) {
  if (!manifest) return null;
  return { ...manifest, files: manifest.files.map(({ objectKey, ...file }) => file) };
}
function packageSummary(manifest) {
  return manifest ? { packageId: manifest.packageId, mode: manifest.mode, fileCount: manifest.files.length, totalSize: manifest.totalSize, issues: manifest.diagnostics?.issues || [] } : null;
}
function objectKeys(record) {
  return record.packageManifest?.files?.map(f => f.objectKey) || [record.filename || record.fileName];
}
async function removeObjects(keys) {
  for (const key of new Set(keys.filter(Boolean))) await minioClient.removeObject(BUCKET_NAME, key);
}
function relativePath(source, target) { return path.posix.relative(path.posix.dirname(source), target); }
function mappedReference(manifest, sourceId, reference) {
  const entry = manifest.diagnostics.references.find(r => r.sourceId === sourceId && r.reference === reference && r.resourceId);
  return entry && manifest.files.find(f => f.id === entry.resourceId);
}

async function portableText(file, manifest) {
  const text = (await readObject(file.objectKey)).toString('utf8');
  if (file.kind === 'material') return refs.rewriteMtl(text, reference => {
    const target = mappedReference(manifest, file.id, reference);
    return target ? relativePath(file.path, target.path) : reference;
  });
  return text.split(/\r?\n/).map(line => {
    const match = line.trim().match(/^mtllib\s+(.+)$/i);
    if (!match) return line;
    return refs.materialLibraries(match[1]).map(reference => {
      const target = mappedReference(manifest, file.id, reference);
      return 'mtllib ' + (target ? relativePath(file.path, target.path) : reference);
    }).join('\n');
  }).join('\n');
}

async function streamPackage(res, manifest, originalName) {
  const zip = new yazl.ZipFile();
  const streams = new Set();
  const name = path.basename(originalName, path.extname(originalName)) + '.zip';
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(name));
  res.setHeader('Cache-Control', 'private, no-store');
  const fail = error => { if (!res.headersSent) { res.removeHeader('Content-Disposition'); res.removeHeader('Content-Type'); res.status(500).json({ message: 'The model package could not be downloaded.' }); } else res.destroy(error); zip.outputStream.destroy(); };
  zip.on('error', fail);
  zip.outputStream.on('error', error => { if (!res.destroyed) res.destroy(error); });
  res.once('close', () => { streams.forEach(stream => stream.destroy()); zip.outputStream.destroy(); });
  // OBJ/MTL export paths are rebound to uploaded files; source downloads remain exact originals.
  for (const file of manifest.files) {
    safePath(file.path);
    if (manifest.format === 'obj' && ['source', 'material'].includes(file.kind)) {
      zip.addBuffer(Buffer.from(await portableText(file, manifest)), file.path);
    } else if (manifest.format === 'fbx' && file.kind === 'source') {
      const bytes = await readObject(file.objectKey);
      const rebound = refs.rewriteFbx(bytes, filename => {
        const entry = refs.matchingFbxReference(manifest.diagnostics.references, filename);
        const target = entry && manifest.files.find(resource => resource.id === entry.resourceId);
        return target ? relativePath(file.path, target.path) : null;
      });
      zip.addBuffer(Buffer.from(rebound), file.path);
    } else {
      zip.addReadStreamLazy(file.path, { size: file.size }, callback => {
        minioClient.getObject(BUCKET_NAME, file.objectKey).then(stream => {
          streams.add(stream); stream.once('end', () => streams.delete(stream)); callback(null, stream);
        }, callback);
      });
    }
  }
  zip.addBuffer(Buffer.from(JSON.stringify(publicManifest(manifest), null, 2)), 'aether-package.json');
  zip.outputStream.pipe(res);
  zip.end();
}

module.exports = { badRequest, safePath, prepareUpload, persistUpload, publicManifest, packageSummary, objectKeys, removeObjects, readObject, streamPackage };
