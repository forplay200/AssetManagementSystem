const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');

const LIMITS = Object.freeze({ bytes: 50 * 1024 * 1024, duration: 60, longEdge: 1920, shortEdge: 1080, fps: 60 });
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
function validateProbe(probe) {
  const streams = probe.streams || [], videos = streams.filter(s => s.codec_type === 'video'), audios = streams.filter(s => s.codec_type === 'audio');
  if (videos.length !== 1 || streams.some(s => !['video', 'audio'].includes(s.codec_type)) || audios.length > 1 || videos[0]?.disposition?.attached_pic) throw invalid('Use one video track and at most one audio track, without subtitles or extra media tracks.');
  const v = videos[0], a = audios[0];
  if (streams.some(s => ['encv', 'enca'].includes(s.codec_tag_string))) throw invalid('Encrypted video and audio are not supported.');
  if (v.codec_name !== 'h264') throw invalid(`This MP4 uses ${v.codec_name || 'an unknown codec'}; export H.264 video with AAC-LC audio or no audio.`);
  if (!['Baseline', 'Constrained Baseline', 'Main', 'High'].includes(v.profile) || v.pix_fmt !== 'yuv420p' || number(v.level) === null || v.level > 42) throw invalid('Use 8-bit 4:2:0 H.264 Baseline, Main or High, up to level 4.2.');
  const w = number(v.width), h = number(v.height), duration = number(probe.format?.duration), vd = number(v.duration);
  if (!(duration > 0 && duration <= LIMITS.duration) || (vd !== null && (!(vd > 0) || vd > LIMITS.duration))) throw invalid('Video duration must be greater than zero and at most 60 seconds.');
  if (!(w > 0 && h > 0) || Math.max(w, h) > LIMITS.longEdge || Math.min(w, h) > LIMITS.shortEdge) throw invalid('Video resolution must fit 1920 × 1080, in landscape or portrait.');
  const avg = rate(v.avg_frame_rate), nominal = rate(v.r_frame_rate);
  if (!(avg > 0 && avg <= LIMITS.fps) || !(nominal > 0 && nominal <= LIMITS.fps)) throw invalid('Use a video frame rate of at most 60 fps.');
  if (a && (a.codec_name !== 'aac' || a.profile !== 'LC' || !(number(a.channels) > 0 && a.channels <= 2))) throw invalid('Audio must be AAC-LC with at most two channels, or omitted.');
  const rawRotation = v.side_data_list?.find(s => s.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0;
  const rotation = number(rawRotation);
  if (rotation === null || rotation % 90 !== 0) throw invalid('Only right-angle video rotation is supported.');
  const rotated = Math.abs(rotation) % 180 === 90;
  const sar = String(v.sample_aspect_ratio || '1:1').split(':').map(Number);
  if (sar.length !== 2 || sar[0] !== sar[1] || sar[0] <= 0) throw invalid('Export video with square pixels.');
  return { schemaVersion: 1, type: 'video', container: 'mp4', videoCodec: v.codec_name, profile: v.profile,
    level: v.level, pixelFormat: v.pix_fmt, durationSeconds: duration, encodedWidth: w, encodedHeight: h,
    displayWidth: rotated ? h : w, displayHeight: rotated ? w : h, rotationDegrees: rotation,
    avgFrameRate: avg, audioCodec: a?.codec_name || null, audioChannels: a?.channels || null, hasAudio: Boolean(a) };
}
let activeProbes = 0;
async function inspectVideo(file) {
  if (process.env.VIDEO_UPLOAD_ENABLED === 'false') throw Object.assign(new Error('New video uploads are currently disabled.'), { status: 503 });
  if (!file.path || !(file.size > 0 && file.size <= LIMITS.bytes)) throw invalid('Video must be a nonempty MP4 of at most 50 MiB.');
  const handle = await fs.open(file.path, 'r');
  const header = Buffer.alloc(64);
  try { await handle.read(header, 0, 64, 0); } finally { await handle.close(); }
  if (header.toString('ascii', 4, 8) !== 'ftyp' || !['isom', 'iso2', 'mp41', 'mp42', 'avc1'].includes(header.toString('ascii', 8, 12))) throw invalid('Use an MP4 container; renaming a MOV or another file to .mp4 does not convert it.');
  const raw = await run(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-protocol_whitelist', 'file', '-enable_drefs', '0', '-use_absolute_path', '0', '-max_alloc', '67108864', '-show_streams', '-show_format', '-of', 'json', file.path]);
  let probe;
  try { probe = JSON.parse(raw); } catch { throw invalid('Video metadata could not be read.'); }
  const media = validateProbe(probe);
  // A bounded opening decode is an upload check, not a guarantee that the entire video is intact.
  await run(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-xerror', '-nostdin', '-protocol_whitelist', 'file', '-enable_drefs', '0', '-use_absolute_path', '0', '-max_alloc', '67108864', '-threads', '1', '-i', file.path, '-map', '0:v:0', '-frames:v', '1', '-f', 'null', '-'], 15000);
  return media;
}
async function probeVideo(file) {
  if (activeProbes >= 2) throw Object.assign(new Error('Video validation is busy. Try uploading again shortly.'), { status: 503 });
  activeProbes++;
  try { return await inspectVideo(file); } finally { activeProbes--; }
}
module.exports = { LIMITS, probeVideo, validateProbe, rate };
