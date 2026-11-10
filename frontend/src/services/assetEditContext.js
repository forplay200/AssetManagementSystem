import { readStoredSession } from '../auth/authStorage';
const sessions = new Map();
export function forgetEditContext(key) { sessions.delete(key); }
export function editContextKey(assetId) {
  const session = readStoredSession();
  return `${session?.token || ''}:${session?.user?.team?.id || ''}:${assetId}`;
}
export function getEditContext(assetId) { return sessions.get(editContextKey(assetId)); }
export function setEditContext(assetId, session) { sessions.set(editContextKey(assetId), session); }
export function advanceEditContext(assetId, token, revision) {
  const session = getEditContext(assetId);
  if (session?.token === token && Number.isSafeInteger(revision) && revision > session.revision) {
    setEditContext(assetId, { ...session, revision });
  }
}
export function clearEditContext(assetId, token, reason = 'released') {
  const key = editContextKey(assetId);
  if (sessions.get(key)?.token !== token) return;
  forgetEditContext(key);
  window.dispatchEvent(new CustomEvent('aether:asset-edit-ended', { detail: { key, assetId: String(assetId), reason } }));
}
export function assetWriteId(config) {
  if (!['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase())) return null;
  const url = config.url || '';
  if (/^\/?assets\/ai\/job$/.test(url)) {
    let body = config.data;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return null; } }
    return body?.assetId;
  }
  const match = url.match(/^\/?assets\/(\d+)(?:\/(.*))?$/);
  if (!match) return null;
  if (!match[2] || /^(?:name|metadata|tags(?:\/[^/]+)?|versions(?:\/upload)?|ai-suggestions(?:\/apply)?|ai-jobs\/[^/]+\/review)$/.test(match[2])) return match[1];
  return null;
}
