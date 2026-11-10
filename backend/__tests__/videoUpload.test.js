const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { Readable } = require('node:stream');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const id = require.resolve('../src/utils/minioClient');
require.cache[id] = { id, filename: id, loaded: true, exports: { minioClient: {}, BUCKET_NAME: 'test' } };
const upload = require('../src/middleware/modelUpload');
const { prepareUpload } = require('../src/utils/modelPackage');
let server, base;
test.before(async () => {
  const app = express();
  app.post('/parser', upload, (req, res) => res.json({ size: req.file.size }));
  app.post('/prepare', upload, async (req, res) => {
    try { const p = await prepareUpload(req); res.json({ mime: p.main.mimetype, media: req.videoMedia }); }
    catch (e) { res.status(e.status || 500).json({ message: e.message }); }
  });
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(() => new Promise(resolve => server.close(resolve)));
async function send(bytes, name, endpoint = '/parser', field = 'asset') {
  const boundary = 'webm-size-boundary';
  async function* body() {
    yield Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
    const block = Buffer.alloc(1024 * 1024, 32);
    for (let left = bytes; left > 0; left -= block.length) yield block.subarray(0, Math.min(left, block.length));
    yield Buffer.from(`\r\n--${boundary}--\r\n`);
  }
  return fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body: Readable.from(body()), duplex: 'half' });
}
test('multipart counts file bytes: exactly 100 MiB accepted, one extra byte rejected, non-video and companion bounds retained', async () => {
  for (const [bytes, name, status] of [[100 * 1024**2, 'edge.webm', 200], [100 * 1024**2 + 1, 'over.mp4', 400], [50 * 1024**2 + 1, 'ordinary.txt', 400]]) {
    const result = await send(bytes, name); assert.equal(result.status, status, await result.text());
  }
  for (const [bytes, name, field] of [[2 * 1024**2 + 1, 'too-big.mtl', 'materials'], [10 * 1024**2 + 1, 'too-big.png', 'textures']]) {
    const result = await send(bytes, name, '/parser', field); assert.equal(result.status, 400);
  }
});
test('fake video extension and oversized non-video cannot reach persistence', async () => {
  const fake = await send(64, 'fake.webm', '/prepare'); assert.equal(fake.status, 400);
  await assert.rejects(prepareUpload({ body: {}, file: { originalname: 'large.txt', mimetype: 'text/plain', size: 50 * 1024**2 + 1 }, files: {} }), /50 MiB/);
});
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const realTools = spawnSync(ffmpeg, ['-version'], { windowsHide: true }).status === 0;
test('real exact-100-MiB MP4 has normalized MIME, valid duration, and no companion bypass', { skip: !realTools }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aether-video-size-'));
  try {
    const target = path.join(directory, 'boundary.mp4');
    const encoded = spawnSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=blue:s=160x120:d=1', '-c:v', 'libx264', '-threads', '1', target], { windowsHide: true, timeout: 15000 });
    assert.equal(encoded.status, 0, String(encoded.stderr));
    const length = (await fs.stat(target)).size, free = Buffer.alloc(8); free.writeUInt32BE(100 * 1024**2 - length); free.write('free', 4);
    await fs.appendFile(target, free); await fs.truncate(target, 100 * 1024**2);
    const file = { originalname: 'boundary.mp4', path: target, size: 100 * 1024**2, mimetype: 'text/plain' };
    const req = { body: {}, file, files: {} }, prepared = await prepareUpload(req);
    assert.equal(prepared.main.mimetype, 'video/mp4'); assert.equal(req.videoMedia.durationSeconds, 1);
    await assert.rejects(prepareUpload({ ...req, files: { textures: [{ originalname: 'texture.png' }] } }), /Companion files/);
    await assert.rejects(prepareUpload({ body: { sourceName: 'disguised.txt' }, file: { ...file, mimetype: 'text/plain' }, files: {} }), /50 MiB/);
    const webm = path.join(directory, 'boundary.webm');
    const encodedWebm = spawnSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=blue:s=160x120:d=1', '-c:v', 'libvpx-vp9', '-threads', '1', webm], { windowsHide: true, timeout: 15000 });
    assert.equal(encodedWebm.status, 0, String(encodedWebm.stderr));
    const webmLength = (await fs.stat(webm)).size, voidElement = Buffer.alloc(9);
    voidElement[0] = 0xec; voidElement.writeBigUInt64BE((1n << 56n) | BigInt(100 * 1024**2 - webmLength - 9), 1);
    await fs.appendFile(webm, voidElement); await fs.truncate(webm, 100 * 1024**2);
    const webmReq = { body: {}, file: { originalname: 'boundary.webm', path: webm, size: 100 * 1024**2, mimetype: 'video/mp4' }, files: {} };
    assert.equal((await prepareUpload(webmReq)).main.mimetype, 'video/webm');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
