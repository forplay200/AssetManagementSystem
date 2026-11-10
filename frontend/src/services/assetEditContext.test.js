import api from './api';
import { writeStoredSession, clearStoredSession } from '../auth/authStorage';
import { assetWriteId, editContextKey, setEditContext, getEditContext, forgetEditContext } from './assetEditContext';

beforeEach(() => writeStoredSession({ token: 'test.jwt', user: { id: 2, team: { id: 8 } } }));
afterEach(() => { forgetEditContext(editContextKey(7)); clearStoredSession(); });
test('only asset writes receive editing credentials; comments, reads, vocabulary and sessions are excluded', () => {
  for (const url of ['/assets/7/metadata', '/assets/7/tags', '/assets/7/tags/1', '/assets/7/name', '/assets/7/versions/upload', '/assets/7/ai-jobs/job/review', '/assets/7/ai-suggestions/apply']) {
    expect(assetWriteId({ method: 'post', url })).toBe('7');
  }
  for (const url of ['/assets/7/comments', '/assets/7/vocabulary', '/assets/7/vocabulary/1', '/assets/7/edit-session', '/assets/7/edit-session/heartbeat', '/assets/upload']) expect(assetWriteId({ method: 'post', url })).toBeNull();
  expect(assetWriteId({ method: 'get', url: '/assets/7/metadata' })).toBeNull();
  expect(assetWriteId({ method: 'post', url: '/assets/ai/job', data: { assetId: 7 } })).toBe(7);
});
test('session credentials are scoped to both login and Workspace', () => {
  setEditContext(7, { token: 'edit-secret', revision: 2 });
  expect(getEditContext(7).token).toBe('edit-secret');
  const original = editContextKey(7);
  writeStoredSession({ token: 'test.jwt', user: { id: 2, team: { id: 9 } } });
  expect(getEditContext(7)).toBeUndefined(); forgetEditContext(original);
});
test('a successful submission sends immutable base values and ends only that session', async () => {
  setEditContext(7, { token: 'edit-secret', revision: 2, baseContentVersionId: 'v1' });
  const response = await api.put('/assets/7/metadata', { metadata: {} }, {
    adapter: async config => ({ data: {}, status: 200, statusText: 'OK', headers: {}, config })
  });
  expect(response.config.headers.get('X-Asset-Edit-Token')).toBe('edit-secret');
  expect(response.config.headers.get('X-Asset-Revision')).toBe('2');
  expect(response.config.headers.get('X-Asset-Base-Version')).toBe('v1');
  expect(getEditContext(7)).toBeUndefined();
});
test('requesting AI suggestions keeps the existing editing credentials', async () => {
  const session = { token: 'edit-secret', revision: 2, baseContentVersionId: 'v1' };
  setEditContext(7, session);
  const response = await api.post('/assets/ai/job', { assetId: 7 }, {
    adapter: async config => ({ data: { editingSessionRetained: true }, status: 201, headers: {}, config })
  });
  expect(response.config.headers.get('X-Asset-Edit-Token')).toBe('edit-secret');
  expect(getEditContext(7)).toBe(session);
});
test('a retained tag edit advances the revision for the next tag action', async () => {
  setEditContext(7, { token: 'edit-secret', revision: 2, baseContentVersionId: 'v1' });
  const adapter = async config => ({ data: { editingSessionRetained: true, revision: 3 }, status: 200, headers: {}, config });
  await api.post('/assets/7/tags', { tag: 'shield', keepEditing: true }, { adapter });
  const next = await api.patch('/assets/7/ai-suggestions', { tag: 'texture', replacement: null }, { adapter });
  expect(next.config.headers.get('X-Asset-Edit-Token')).toBe('edit-secret');
  expect(next.config.headers.get('X-Asset-Revision')).toBe('3');
});
test('validation failures preserve the session while expired versions invalidate it without automatic retry', async () => {
  setEditContext(7, { token: 'edit-secret', revision: 2, baseContentVersionId: 'v1' });
  const attempt = code => api.put('/assets/7/metadata', {}, { adapter: async config => { throw Object.assign(new Error(code), { config, response: { status: 409, data: { code } } }); } });
  await expect(attempt('VALIDATION_ERROR')).rejects.toBeTruthy();
  expect(getEditContext(7)).toBeTruthy();
  await expect(attempt('REVISION_CONFLICT')).rejects.toBeTruthy();
  expect(getEditContext(7)).toBeUndefined();
});
