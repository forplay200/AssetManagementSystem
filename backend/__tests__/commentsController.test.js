const test = require('node:test');
const assert = require('node:assert/strict');

let currentComment;
let historyRows = [];
let saveCount = 0;
let destroyCount = 0;

const models = {
  Asset: {
    async findByPk(id) { return { id: Number(id), workspaceId: 4 }; }
  },
  Comment: {
    async findByPk() { return currentComment; },
    async findOne() { return currentComment; },
    async findAndCountAll() { return { count: historyRows.length, rows: historyRows }; },
    async create(values) { return makeComment({ id: 99, ...values }); }
  },
  User: {}
};

function mockModule(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

mockModule('../src/models', models);
mockModule('../src/utils/logger', { error() {} });
const controller = require('../src/controllers/commentsController');

function makeComment(overrides = {}) {
  return {
    id: 8,
    assetId: 12,
    userId: 20,
    content: 'Original comment',
    isDeleted: false,
    createdAt: new Date('2026-07-12T06:00:00.000Z'),
    updatedAt: new Date('2026-07-12T06:00:00.000Z'),
    asset: { id: 12, workspaceId: 4 },
    author: { id: 20, username: 'author' },
    parent: null,
    async save() {
      saveCount += 1;
      this.updatedAt = new Date('2026-07-12T06:32:00.000Z');
    },
    async destroy() { destroyCount += 1; },
    ...overrides
  };
}

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

function request(role, userId, body = {}) {
  return { params: { id: '8' }, body, user: { id: userId, workspaceId: 4, teamRole: role } };
}

test.beforeEach(() => {
  saveCount = 0;
  destroyCount = 0;
  historyRows = [];
  currentComment = makeComment();
});

test('Owner can edit any comment without changing createdAt', async () => {
  const originalCreatedAt = currentComment.createdAt;
  const res = response();
  await controller.updateComment(request('owner', 77, { content: '  Owner correction  ' }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(currentComment.content, 'Owner correction');
  assert.equal(currentComment.createdAt, originalCreatedAt);
  assert.ok(currentComment.updatedAt > currentComment.createdAt);
  assert.equal(saveCount, 1);
});

test('Manager can edit and soft-delete only their own comment', async () => {
  currentComment = makeComment({ userId: 31 });
  const editRes = response();
  await controller.updateComment(request('manager', 31, { content: 'Manager edit' }), editRes);
  assert.equal(editRes.statusCode, 200);

  const deleteRes = response();
  await controller.deleteComment(request('manager', 31), deleteRes);
  assert.equal(deleteRes.statusCode, 200);
  assert.equal(currentComment.isDeleted, true);
  assert.equal(currentComment.content, 'Manager edit');
  assert.equal(deleteRes.payload.comment.content, 'Comment deleted by author.');
  assert.equal(destroyCount, 0);
});

test('Collaborator can edit and soft-delete only their own comment', async () => {
  currentComment = makeComment({ userId: 41 });
  const editRes = response();
  await controller.updateComment(request('collaborator', 41, { content: 'Collaborator edit' }), editRes);
  assert.equal(editRes.statusCode, 200);

  const deleteRes = response();
  await controller.deleteComment(request('collaborator', 41), deleteRes);
  assert.equal(deleteRes.statusCode, 200);
  assert.equal(currentComment.isDeleted, true);
  assert.equal(destroyCount, 0);
});

test('Manager and Collaborator cannot change another user comment', async () => {
  const managerEdit = response();
  await controller.updateComment(request('manager', 99, { content: 'Not allowed' }), managerEdit);
  assert.equal(managerEdit.statusCode, 403);

  const collaboratorDelete = response();
  await controller.deleteComment(request('collaborator', 99), collaboratorDelete);
  assert.equal(collaboratorDelete.statusCode, 403);
  assert.equal(currentComment.isDeleted, false);
  assert.equal(saveCount, 0);
});

test('Owner can soft-delete another user comment', async () => {
  const res = response();
  await controller.deleteComment(request('owner', 99), res);
  assert.equal(res.statusCode, 200);
  assert.equal(currentComment.isDeleted, true);
  assert.equal(saveCount, 1);
  assert.equal(destroyCount, 0);
});

test('deleted comments use a placeholder and replies remain in history', async () => {
  const deletedParent = makeComment({ id: 8, isDeleted: true, content: 'Hidden original' });
  const reply = makeComment({ id: 9, parentId: 8, userId: 22, content: 'Reply remains', parent: { id: 8, content: 'Hidden original', isDeleted: true } });
  historyRows = [deletedParent, reply];
  const res = response();

  await controller.getCommentHistory({ params: { assetId: '12' }, query: {}, user: { workspaceId: 4 } }, res);

  assert.equal(res.payload.comments.length, 2);
  assert.equal(res.payload.comments[0].content, 'Comment deleted by author.');
  assert.equal(res.payload.comments[1].content, 'Reply remains');
  assert.equal(res.payload.comments[1].parent.content, 'Comment deleted by author.');
});

test('comments from another workspace are not exposed', async () => {
  const res = response();
  await controller.updateComment({ params: { id: '8' }, body: { content: 'Nope' }, user: { id: 20, workspaceId: 9, teamRole: 'owner' } }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(saveCount, 0);
});
