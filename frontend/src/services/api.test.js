import api, { setAuthorizationToken } from './api';
import { clearStoredSession, writeStoredSession } from '../auth/authStorage';

afterEach(() => {
  clearStoredSession();
  setAuthorizationToken(null);
});

test('attaches the persisted JWT to an authenticated asset request', async () => {
  writeStoredSession({ token: 'persisted.jwt.token', user: { id: 7 } });

  const response = await api.get('/assets/search', {
    adapter: async (config) => ({ data: {}, status: 200, statusText: 'OK', headers: {}, config }),
  });

  expect(response.config.headers.get('Authorization')).toBe('Bearer persisted.jwt.token');
});

test('synchronizes and clears the Axios default authorization header', () => {
  setAuthorizationToken('new.jwt.token');
  expect(api.defaults.headers.common.Authorization).toBe('Bearer new.jwt.token');
  setAuthorizationToken(null);
  expect(api.defaults.headers.common.Authorization).toBeUndefined();
});
