import { clearStoredSession, readStoredSession, writeStoredSession } from './authStorage';

afterEach(clearStoredSession);

test('persists the complete authentication session for refresh restoration', () => {
  const session = { token: 'header.payload.signature', user: { id: 4, role: 'designer' } };
  writeStoredSession(session);
  expect(readStoredSession()).toEqual(session);
});

test('removes malformed persisted session data', () => {
  localStorage.setItem('aether.session', '{invalid-json');
  expect(readStoredSession()).toBeNull();
  expect(localStorage.getItem('aether.session')).toBeNull();
});
