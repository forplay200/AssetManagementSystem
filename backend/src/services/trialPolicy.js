const crypto = require('node:crypto');
const enabled = () => process.env.PUBLIC_TRIAL_ENABLED === 'true';
const fail = (message, status = 429) => Object.assign(new Error(message), { status });
function limit(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${name}`);
  return value;
}
function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if ((enabled() || process.env.NODE_ENV === 'production') && (!secret || Buffer.byteLength(secret) < 32 || /your_secret|your_jwt|change.me/i.test(secret))) throw new Error('Configure a random JWT_SECRET of at least 32 bytes before public use.');
  return secret || 'your_secret_key';
}
function registration(code) {
  const mode = process.env.REGISTRATION_MODE || 'open';
  if (mode === 'closed') throw fail('New registrations are temporarily paused.', 403);
  if (!['open', 'invite'].includes(mode)) throw new Error('Invalid REGISTRATION_MODE');
  if (mode === 'invite') {
    const expected = process.env.TRIAL_INVITE_CODE;
    if (!expected) throw fail('Trial registration is not configured yet.', 503);
    const hash = value => crypto.createHash('sha256').update(String(value || '')).digest();
    if (!crypto.timingSafeEqual(hash(code), hash(expected))) throw fail('Enter the trial access code provided with the community link.', 403);
  }
}
async function lock(db, transaction, key = 21051101) {
  await db.sequelize.query('SELECT pg_advisory_xact_lock(:key)', { replacements: { key }, transaction });
}
async function admitAccount(db, transaction) {
  if (!enabled()) return;
  await lock(db, transaction);
  if (await db.User.count({ transaction }) >= limit('TRIAL_MAX_ACCOUNTS', 300)) throw fail('The trial is currently full. Please try again later.', 403);
}
async function admitWorkspace(db, userId, transaction) {
  if (!enabled()) return;
  await lock(db, transaction);
  if (await db.Team.count({ where: { createdBy: userId }, transaction }) >= limit('TRIAL_WORKSPACES_PER_ACCOUNT', 1)) throw fail('Each trial account can create one workspace. You can still join another workspace.', 403);
}
module.exports = { enabled, limit, fail, jwtSecret, registration, lock, admitAccount, admitWorkspace };
