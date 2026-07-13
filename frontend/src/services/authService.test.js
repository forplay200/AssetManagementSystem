import { normalizeAuthResponse } from './authService';

test('normalizes the backend login response token', () => {
  expect(normalizeAuthResponse({ token: 'jwt', user: { id: 1 } })).toEqual({ token: 'jwt', user: { id: 1 } });
});

test('accepts the legacy accessToken field without changing the stored session shape', () => {
  expect(normalizeAuthResponse({ accessToken: 'legacy-jwt', user: { id: 1 } }).token).toBe('legacy-jwt');
});

test('rejects a login response that contains no token', () => {
  expect(() => normalizeAuthResponse({ user: { id: 1 } })).toThrow(/did not include a JWT token/i);
});
