import { isTokenExpired } from './AuthContext';

function tokenWithExpiry(exp) {
  const payload = btoa(JSON.stringify({ exp })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `header.${payload}.signature`;
}

test('recognizes active and expired JWT sessions', () => {
  const now = 2_000_000_000_000;
  expect(isTokenExpired(tokenWithExpiry(now / 1000 + 60), now)).toBe(false);
  expect(isTokenExpired(tokenWithExpiry(now / 1000 - 1), now)).toBe(true);
});

test('treats malformed tokens as expired', () => {
  expect(isTokenExpired('not-a-token')).toBe(true);
});
