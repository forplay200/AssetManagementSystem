const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateProbe, rate, probeVideo, detectContainer } = require('../src/utils/videoMetadata');
function fixture(v = {}, a = []) {
  return { format: { duration: '60' }, streams: [{ codec_type: 'video', codec_name: 'h264', profile: 'High', level: 42, pix_fmt: 'yuv420p', width: 1920, height: 1080,
    duration: '60', avg_frame_rate: '60/1', r_frame_rate: '60/1', sample_aspect_ratio: '1:1', ...v }, ...a] };
}
test('video limits accept exact boundaries, portrait, right-angle rotation and AAC-LC stereo', () => {
  const p = fixture({}, [{ codec_type: 'audio', codec_name: 'aac', profile: 'LC', channels: 2 }]);
  assert.equal(validateProbe(p).durationSeconds, 60); assert.equal(validateProbe(p).hasAudio, true);
  assert.equal(validateProbe(fixture({ side_data_list: [{ rotation: -90 }] })).displayWidth, 1080);
  assert.equal(validateProbe(fixture({ width: 1080, height: 1920 })).displayHeight, 1920);
  assert.equal(validateProbe(fixture({ duration: '0.04', avg_frame_rate: '1/1' })).hasAudio, false);
});
for (const [name, mutate] of [
  ['HEVC', p => p.streams[0].codec_name = 'hevc'], ['10-bit', p => p.streams[0].pix_fmt = 'yuv420p10le'],
  ['duration over limit', p => p.format.duration = '180.001'], ['zero duration', p => p.format.duration = '0'],
  ['N/A duration', p => p.format.duration = 'N/A'], ['infinity duration', p => p.format.duration = 'Infinity'],
  ['dimension over limit', p => p.streams[0].width = 1921], ['bad frame rate', p => p.streams[0].avg_frame_rate = '0/0'],
  ['over 60 fps', p => p.streams[0].r_frame_rate = '61/1'], ['attached cover', p => p.streams[0].disposition = { attached_pic: 1 }],
  ['multiple video', p => p.streams.push(p.streams[0])], ['audio only', p => p.streams = [{ codec_type: 'audio' }]],
  ['subtitle', p => p.streams.push({ codec_type: 'subtitle' })], ['non-square pixels', p => p.streams[0].sample_aspect_ratio = '4:3'],
  ['surround audio', p => p.streams.push({ codec_type: 'audio', codec_name: 'aac', profile: 'LC', channels: 6 })]
]) test('video validation rejects ' + name, () => {
  const p = fixture(); mutate(p); assert.throws(() => validateProbe(p), e => e.status === 400);
});
test('frame rate fractions reject unusable values and file size fails before tools run', async () => {
  assert.equal(rate('30000/1001'), 30000 / 1001); assert.equal(rate('1/0'), null); assert.equal(rate('N/A'), null);
  await assert.rejects(probeVideo({ path: 'unused', size: 100 * 1024 * 1024 + 1 }), e => e.status === 400);
});

const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const realTools = spawnSync(ffmpeg, ['-version'], { windowsHide: true }).status === 0;
test('real MP4 probe normalizes MIME-independent technical data and rejects MOV/garbage', { skip: !realTools }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aether-video-validation-'));
  try {
    for (const [name, args] of [['valid.mp4', ['-c:v', 'libx264', '-pix_fmt', 'yuv420p']], ['disguised.mp4', ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-f', 'mov']]]) {
      const target = path.join(directory, name);
      const result = spawnSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x120:r=7:d=0.4', ...args, '-threads', '1', target], { timeout: 20000, windowsHide: true });
      assert.equal(result.status, 0, String(result.stderr));
      const file = { path: target, size: (await fs.stat(target)).size };
      if (name === 'valid.mp4') { const media = await probeVideo(file); assert.equal(media.type, 'video'); assert.equal(media.encodedWidth, 160); }
      else await assert.rejects(probeVideo(file), /MP4 container/);
    }
    const fake = path.join(directory, 'fake.mp4'); await fs.writeFile(fake, 'not a video');
    await assert.rejects(probeVideo({ path: fake, size: 11 }), e => e.status === 400);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

function webmFixture(video = {}, audio = []) {
  const p = fixture({ codec_name: 'vp9', profile: 'Profile 0', level: undefined, sample_aspect_ratio: undefined, ...video }, audio);
  p.format.duration = '180'; p.streams[0].duration = undefined;
  return p;
}
test('WebM codec profiles, missing optional SAR, and exact 180 second duration', () => {
  for (const codec of ['vp8', 'vp9']) for (const audio of [[], [{ codec_type: 'audio', codec_name: 'opus', channels: 2 }], [{ codec_type: 'audio', codec_name: 'vorbis', channels: 1 }]]) {
    const media = validateProbe(webmFixture({ codec_name: codec }, audio), 'webm');
    assert.equal(media.container, 'webm'); assert.equal(media.durationSeconds, 180); assert.equal(media.level, null);
  }
  for (const video of [{ codec_name: 'av1' }, { codec_name: 'h264' }, { pix_fmt: 'yuv420p10le' }, { profile: 'Profile 2' }, { tags: { ALPHA_MODE: '1' } }, { color_transfer: 'smpte2084' }, { sample_aspect_ratio: '0:0' }]) {
    assert.throws(() => validateProbe(webmFixture(video), 'webm'), e => e.status === 400);
  }
  assert.throws(() => validateProbe(webmFixture({}, [{ codec_type: 'audio', codec_name: 'aac', profile: 'LC', channels: 2 }]), 'webm'));
});
test('bounded EBML parser skips variable-size elements and refuses MKV, truncation and duplicate DocType', () => {
  const header = Buffer.from('1a45dfa38b428681014282847765626d', 'hex');
  assert.equal(detectContainer(header, 'webm'), 'webm');
  for (const h of [Buffer.from('1a45dfa38b4282886d6174726f736b61', 'hex'), header.subarray(0, 9), Buffer.from('1a45dfa3ff', 'hex'), Buffer.from('1a45dfa38e4282847765626d4282847765626d', 'hex')]) assert.throws(() => detectContainer(h));
  assert.throws(() => detectContainer(header, 'mp4'));
});
test('real WebM VP8/VP9, Opus/Vorbis, portrait and single-frame files decode; MKV and spoofed extension fail', { skip: !realTools }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aether-webm-validation-'));
  try {
    for (const [name, codec, audio, extra] of [
      ['vp8-opus.webm', 'libvpx', 'libopus', []], ['vp9-opus.webm', 'libvpx-vp9', 'libopus', []],
      ['vp9-vorbis.webm', 'libvpx-vp9', 'libvorbis', []], ['silent.webm', 'libvpx', null, []],
      ['renamed.webm', 'libvpx', null, ['-f', 'matroska']], ['av1.webm', 'libaom-av1', null, ['-cpu-used', '8']],
      ['tenbit.webm', 'libvpx-vp9', null, ['-pix_fmt', 'yuv420p10le']], ['alpha.webm', 'libvpx', null, ['-metadata:s:v:0', 'alpha_mode=1']]
    ]) {
      const target = path.join(directory, name);
      const result = spawnSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=120x160:r=25:d=0.04', ...(audio ? ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.04', '-c:a', audio] : []), '-c:v', codec, '-pix_fmt', 'yuv420p', '-threads', '1', ...extra, target], { timeout: 25000, windowsHide: true });
      assert.equal(result.status, 0, String(result.stderr));
      const file = { path: target, originalname: name, mimetype: 'application/octet-stream', size: (await fs.stat(target)).size };
      if (['renamed.webm', 'av1.webm', 'tenbit.webm', 'alpha.webm'].includes(name)) await assert.rejects(probeVideo(file), e => e.status === 400);
      else { const media = await probeVideo(file); assert.equal(media.container, 'webm'); assert.equal(media.encodedHeight, 160); }
      if (name === 'silent.webm') await assert.rejects(probeVideo({ ...file, originalname: 'spoof.mp4' }), /matching the extension/);
    }
    const live = spawnSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=blue:s=160x120:r=25:d=0.4', '-c:v', 'libvpx', '-threads', '1', '-f', 'webm', 'pipe:1'], { timeout: 15000, windowsHide: true });
    assert.equal(live.status, 0, String(live.stderr));
    const unknown = path.join(directory, 'unknown-duration.webm'); await fs.writeFile(unknown, live.stdout);
    await assert.rejects(probeVideo({ path: unknown, originalname: 'unknown-duration.webm', size: live.stdout.length }), /known duration/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
