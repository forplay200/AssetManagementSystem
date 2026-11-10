import { AUTH_STORAGE_KEY, clearStoredSession, readStoredSession, writeStoredSession } from './authStorage';

afterEach(clearStoredSession);

test('persists the complete authentication session for refresh restoration', () => {
  const session = { token: 'header.payload.signature', user: { id: 4, role: 'user' } };
  writeStoredSession(session);
  expect(readStoredSession()).toEqual(session);
});

test('removes malformed persisted session data', () => {
  localStorage.setItem(AUTH_STORAGE_KEY, '{invalid-json');
  expect(readStoredSession()).toBeNull();
  expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
});

test('discards sessions written before the canonical role names', () => {
  localStorage.setItem('aether.session', JSON.stringify({ token: 'old', user: { role: 'owner' } }));
  expect(readStoredSession()).toBeNull();
  expect(localStorage.getItem('aether.session')).toBeNull();
});
