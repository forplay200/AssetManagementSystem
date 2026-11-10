const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');

const { LIMITS } = require('./videoPolicy');
const path = require('node:path');
function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }
function number(value) { const n = Number(value); return value !== null && value !== '' && Number.isFinite(n) ? n : null; }
function rate(value) {
  const [a, b = '1'] = String(value).split('/');
  return number(a) !== null && number(b) > 0 ? number(a) / number(b) : null;
}
function run(binary, args, timeout = 15000) {
  if (process.platform === 'linux') {
    args = ['--as=2147483648', '--cpu=15', '--fsize=4194304', '--nofile=64', '--', binary, ...args];
    binary = 'prlimit';
  }
  return new Promise((resolve, reject) => execFile(binary, args, { timeout, maxBuffer: 512 * 1024, windowsHide: true }, (error, stdout) => {
    if (error) return reject(Object.assign(new Error(error.code === 'ENOENT' ? 'Video validation is unavailable: FFmpeg tools are not installed.' : 'Video could not be decoded within the supported limits.'), { status: error.code === 'ENOENT' ? 503 : 400 }));
    resolve(stdout);
  }));
}
// Only the bounded EBML header is read. Matroska and WebM share a demuxer;
// ffprobe's format_name alone cannot distinguish their DocTypes.
function detectContainer(header, expected) {
  let container;
  if (header.length >= 12 && header.toString('utf8', 4, 8) === 'ftyp' && ['isom', 'iso2', 'mp41', 'mp42', 'avc1'].includes(header.toString('utf8', 8, 12))) container = 'mp4';
  else if (header.length >= 5 && header.readUInt32BE(0) === 0x1a45dfa3) {
    function vint(offset, id = false) {
      const first = header[offset];
      if (!first) throw invalid('Invalid EBML header.');
      let width = 1, mask = 128;
      while (!(first & mask)) { width++; mask >>= 1; }
      if (width > (id ? 4 : 8) || offset + width > header.length) throw invalid('Invalid EBML header.');
      let value = BigInt(id ? first : first & (mask - 1));
      for (let i = 1; i < width; i++) value = value * 256n + BigInt(header[offset + i]);
      if (!id && value === (1n << BigInt(7 * width)) - 1n) throw invalid('Unknown EBML header length.');
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid('Oversized EBML header.');
      return { value: Number(value), next: offset + width };
    }
    const length = vint(4), end = length.next + length.value;
    if (end > header.length || end > 4096) throw invalid('Invalid or oversized EBML header.');
    let offset = length.next, docType;
    while (offset < end) {
      const id = vint(offset, true), size = vint(id.next), next = size.next + size.value;
      if (next > end) throw invalid('Invalid EBML element length.');
      if (id.value === 0x4282) {
        if (docType !== undefined) throw invalid('Duplicate EBML DocType.');
        docType = header.toString('utf8', size.next, next);
      }
      offset = next;
    }
    if (docType !== 'webm') throw invalid('Use WebM with EBML DocType webm; renaming an MKV does not convert it.');
    container = 'webm';
  }
  if (!container || (expected && container !== expected)) throw invalid('Use an MP4 container or WebM container matching the extension; renaming a file does not convert it.');
  return container;
}
const inputOptions = container => ['-protocol_whitelist', 'file', ...(container === 'mp4' ? ['-enable_drefs', '0', '-use_absolute_path', '0'] : []), '-max_alloc', '67108864'];
function validateProbe(probe, container = 'mp4') {
  const streams = probe.streams || [], videos = streams.filter(s => s.codec_type === 'video'), audios = streams.filter(s => s.codec_type === 'audio');
  if (videos.length !== 1 || streams.some(s => !['video', 'audio'].includes(s.codec_type)) || audios.length > 1 || videos[0]?.disposition?.attached_pic) throw invalid('Use one video track and at most one audio track, without subtitles or extra media tracks.');
  const v = videos[0], a = audios[0];
  if (streams.some(s => ['encv', 'enca'].includes(s.codec_tag_string))) throw invalid('Encrypted video and audio are not supported.');
  if (container === 'mp4') {
    if (v.codec_name !== 'h264') throw invalid(`This MP4 uses ${v.codec_name || 'an unknown codec'}; export H.264 video with AAC-LC audio or no audio.`);
    if (!['Baseline', 'Constrained Baseline', 'Main', 'High'].includes(v.profile) || v.pix_fmt !== 'yuv420p' || number(v.level) === null || v.level <= 0 || v.level > 42) throw invalid('Use 8-bit 4:2:0 H.264 Baseline, Main or High, up to level 4.2.');
  } else if (container !== 'webm' || !['vp8', 'vp9'].includes(v.codec_name) || v.pix_fmt !== 'yuv420p' || (v.codec_name === 'vp9' && !['Profile 0', '0'].includes(String(v.profile)))) {
    throw invalid('This WebM uses an unsupported video codec. Use VP8 or 8-bit VP9 profile 0 with Opus/Vorbis audio, or no audio.');
  }
  if (streams.some(s => Object.entries(s.tags || {}).some(([key, value]) => key.toLowerCase() === 'alpha_mode' && String(value) !== '0')) || ['smpte2084', 'arib-std-b67'].includes(v.color_transfer)) throw invalid('Transparent and HDR videos are not supported.');
  const w = number(v.width), h = number(v.height), duration = number(probe.format?.duration), vd = number(v.duration);
  if (!(duration > 0 && duration <= LIMITS.duration) || (vd !== null && (!(vd > 0) || vd > LIMITS.duration))) throw invalid('Video needs a known duration greater than zero and at most 180 seconds. Re-export files with unknown duration.');
  if (!(w > 0 && h > 0) || Math.max(w, h) > LIMITS.longEdge || Math.min(w, h) > LIMITS.shortEdge) throw invalid('Video resolution must fit 1920 × 1080, in landscape or portrait.');
  const avg = rate(v.avg_frame_rate), nominal = rate(v.r_frame_rate);
  if (!(avg > 0 && avg <= LIMITS.fps) || !(nominal > 0 && nominal <= LIMITS.fps)) throw invalid('Use a video frame rate of at most 60 fps.');
  if (a && (!(number(a.channels) > 0 && a.channels <= 2) || (container === 'mp4' ? a.codec_name !== 'aac' || a.profile !== 'LC' : !['opus', 'vorbis'].includes(a.codec_name)))) throw invalid(container === 'mp4' ? 'Audio must be AAC-LC with at most two channels, or omitted.' : 'WebM audio must be Opus or Vorbis with at most two channels, or omitted.');
  const rawRotation = v.side_data_list?.find(s => s.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0;
  const rotation = number(rawRotation);
  if (rotation === null || rotation % 90 !== 0) throw invalid('Only right-angle video rotation is supported.');
  const rotated = Math.abs(rotation) % 180 === 90;
  const unspecifiedSar = container === 'webm' && ['N/A', '0:1'].includes(v.sample_aspect_ratio);
  const sar = String(unspecifiedSar ? '1:1' : v.sample_aspect_ratio ?? '1:1').split(':').map(Number);
  if (sar.length !== 2 || sar[0] !== sar[1] || sar[0] <= 0) throw invalid('Export video with square pixels.');
  return { schemaVersion: 1, type: 'video', container, videoCodec: v.codec_name, profile: v.profile || null,
    level: container === 'mp4' ? v.level : null, pixelFormat: v.pix_fmt, durationSeconds: duration, encodedWidth: w, encodedHeight: h,
    displayWidth: rotated ? h : w, displayHeight: rotated ? w : h, rotationDegrees: rotation,
    avgFrameRate: avg, audioCodec: a?.codec_name || null, audioChannels: a?.channels || null, hasAudio: Boolean(a) };
}
let activeProbes = 0;
async function inspectVideo(file) {
  if (process.env.VIDEO_UPLOAD_ENABLED === 'false') throw Object.assign(new Error('New video uploads are currently disabled.'), { status: 503 });
  if (!file.path || !(file.size > 0 && file.size <= LIMITS.bytes)) throw invalid('Video must be a nonempty MP4 or WebM of at most 100 MiB.');
  const handle = await fs.open(file.path, 'r');
  const header = Buffer.alloc(4096);
  let bytesRead;
  try { ({ bytesRead } = await handle.read(header, 0, header.length, 0)); } finally { await handle.close(); }
  const expected = path.extname(file.originalname || '').slice(1).toLowerCase();
  const container = detectContainer(header.subarray(0, bytesRead), expected || undefined);
  const raw = await run(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', ...inputOptions(container), '-show_streams', '-show_format', '-of', 'json', file.path]);
  let probe;
  try { probe = JSON.parse(raw); } catch { throw invalid('Video metadata could not be read.'); }
  const media = validateProbe(probe, container);
  // A bounded opening decode is an upload check, not a guarantee that the entire video is intact.
  await run(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-xerror', '-nostdin', ...inputOptions(container), '-threads', '1', '-i', file.path, '-map', '0:v:0', '-frames:v', '1', '-f', 'null', '-'], 15000);
  return media;
}
async function probeVideo(file) {
  if (activeProbes >= 2) throw Object.assign(new Error('Video validation is busy. Try uploading again shortly.'), { status: 503 });
  activeProbes++;
  try { return await inspectVideo(file); } finally { activeProbes--; }
}
module.exports = { LIMITS, probeVideo, validateProbe, rate, detectContainer };
