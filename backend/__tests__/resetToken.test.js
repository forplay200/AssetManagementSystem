const test = require('node:test');
const assert = require('node:assert/strict');
const { hashResetToken } = require('../src/utils/resetToken');

test('hashes reset tokens deterministically without storing the raw value', () => {
  const raw = 'a'.repeat(64);
  const hashed = hashResetToken(raw);
  assert.equal(hashed.length, 64);
  assert.notEqual(hashed, raw);
  assert.equal(hashResetToken(raw), hashed);
});
