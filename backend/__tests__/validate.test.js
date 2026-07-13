const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../src/middleware/validate');

function run(schema, body) {
  let result;
  let nextCalled = false;
  const res = { status(code) { result = { code }; return this; }, json(payload) { result.payload = payload; return this; } };
  validate(schema)({ body }, res, () => { nextCalled = true; });
  return { result, nextCalled };
}

test('rejects missing, invalid email, and short values', () => {
  const schema = { body: { username: { type: 'string', required: true }, email: { type: 'string', required: true, email: true }, password: { type: 'string', required: true, minLength: 6 } } };
  const { result, nextCalled } = run(schema, { email: 'invalid', password: '123' });
  assert.equal(nextCalled, false);
  assert.equal(result.code, 400);
  assert.equal(result.payload.message, 'Validation failed');
  assert.deepEqual(result.payload.errors.map((error) => error.field), ['username', 'email', 'password']);
});

test('passes valid input to the next middleware', () => {
  const schema = { body: { email: { type: 'string', required: true, email: true }, password: { type: 'string', required: true, minLength: 6 } } };
  const { nextCalled } = run(schema, { email: 'user@example.com', password: 'secret1' });
  assert.equal(nextCalled, true);
});
