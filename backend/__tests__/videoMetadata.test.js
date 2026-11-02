const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateProbe, rate, probeVideo } = require('../src/utils/videoMetadata');
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
  ['duration over limit', p => p.format.duration = '60.001'], ['zero duration', p => p.format.duration = '0'],
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
  await assert.rejects(probeVideo({ path: 'unused', size: 50 * 1024 * 1024 + 1 }), e => e.status === 400);
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
