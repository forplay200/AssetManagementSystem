import api, { setAuthorizationToken } from './api';
import { clearStoredSession, writeStoredSession } from '../auth/authStorage';

afterEach(() => {
  clearStoredSession();
  setAuthorizationToken(null);
});

test('attaches the persisted JWT to an authenticated asset request', async () => {
  writeStoredSession({ token: 'persisted.jwt.token', user: { id: 7, team: { id: 12 } } });

  const response = await api.get('/assets/search', {
    adapter: async (config) => ({ data: {}, status: 200, statusText: 'OK', headers: {}, config }),
  });

  expect(response.config.headers.get('Authorization')).toBe('Bearer persisted.jwt.token');
  expect(response.config.headers.get('X-Workspace-Id')).toBe('12');
  expect(response.config.headers.get('X-Team-Id')).toBe('12');
});

test('synchronizes and clears the Axios default authorization header', () => {
  setAuthorizationToken('new.jwt.token');
  expect(api.defaults.headers.common.Authorization).toBe('Bearer new.jwt.token');
  setAuthorizationToken(null);
  expect(api.defaults.headers.common.Authorization).toBeUndefined();
});

test('forbidden asset requests refresh workspace permissions without replaying the write', async () => {
  const listener = jest.fn(); window.addEventListener('aether:workspace-permissions-changed', listener);
  const adapter = jest.fn(async config => { throw Object.assign(new Error('Forbidden'), { config, response: { status: 403, data: { message: 'Only the uploader can edit this asset.' } } }); });
  try {
    await expect(api.put('/assets/2/metadata', { metadata: {} }, { adapter })).rejects.toBeTruthy();
    expect(listener).toHaveBeenCalledTimes(1); expect(adapter).toHaveBeenCalledTimes(1);
  } finally { window.removeEventListener('aether:workspace-permissions-changed', listener); }
});
