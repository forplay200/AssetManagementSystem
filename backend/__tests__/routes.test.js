const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function mockModule(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function routeSignatures(router) {
  return router.stack.filter((layer) => layer.route).flatMap((layer) => Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${layer.route.path}`));
}

test('mounts password recovery routes', () => {
  mockModule('../src/controllers/authController', { register() {}, login() {}, forgotPassword() {}, resetPassword() {}, logout() {} });
  mockModule('../src/middleware/auth', (_req, _res, next) => next());
  const router = require('../src/routes/auth');
  const signatures = routeSignatures(router);
  assert.ok(signatures.includes('POST /forgot-password'));
  assert.ok(signatures.includes('POST /reset-password'));
});

test('user router exposes protected CRUD routes and is mounted by the app', () => {
  mockModule('../src/controllers/userController', { getAllUsers() {}, getUserById() {}, createUser() {}, updateUser() {}, deleteUser() {} });
  mockModule('../src/middleware/auth', (_req, _res, next) => next());
  const router = require('../src/routes/users');
  const signatures = routeSignatures(router);
  assert.deepEqual(signatures.sort(), ['DELETE /:id', 'GET /', 'GET /:id', 'POST /', 'PUT /:id'].sort());
  const indexSource = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  assert.match(indexSource, /app\.use\('\/api\/users', apiLimiter, userRoutes\)/);
});

test('asset router exposes the backward-compatible replacement upload route', () => {
  const routeSource = fs.readFileSync(path.join(__dirname, '../src/routes/assets.js'), 'utf8');
  assert.match(routeSource, /router\.post\('\/:id\/versions\/upload'.*upload\.single\('asset'\).*uploadNewVersion\)/);
  assert.match(routeSource, /router\.post\('\/:id\/versions'.*createVersion\)/);
});
