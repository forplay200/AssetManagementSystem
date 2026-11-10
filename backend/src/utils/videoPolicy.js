const VIDEO_MIMES = Object.freeze(['video/mp4', 'video/webm']);
const LIMITS = Object.freeze({ bytes: 100 * 1024 * 1024, duration: 180, longEdge: 1920, shortEdge: 1080, fps: 60 });
const SAMPLING = Object.freeze({ version: 'midpoint-v2', intervalSeconds: 2, maxFrames: 45 });
const LEGACY_SAMPLING = Object.freeze({ version: 'midpoint-v1', intervalSeconds: 2, maxFrames: 30 });
const TASK_SECONDS = 300;
const isVideo = asset => VIDEO_MIMES.includes(asset?.mimetype);
function samplingTimes(duration, policy = LEGACY_SAMPLING) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > LIMITS.duration ||
      !['midpoint-v1', 'midpoint-v2'].includes(policy.version) || policy.intervalSeconds !== 2 ||
      policy.maxFrames !== (policy.version === 'midpoint-v1' ? 30 : 45)) throw new Error('Invalid video sampling policy.');
  const count = Math.min(policy.maxFrames, Math.max(1, Math.ceil(duration / policy.intervalSeconds)));
  return Array.from({ length: count }, (_, i) => (i + 0.5) * duration / count);
}
module.exports = { VIDEO_MIMES, LIMITS, SAMPLING, LEGACY_SAMPLING, TASK_SECONDS, isVideo, samplingTimes };
