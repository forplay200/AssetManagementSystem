const db = require('/app/src/models'); db.sequelize.options.logging = false;
const fs = require('fs'); const assert = require('assert/strict'); const crypto = require('crypto'); const sharp = require('/app/node_modules/sharp');
const { minioClient, BUCKET_NAME } = require('/app/src/utils/minioClient');
const redis = require('/app/src/redisClient');
const statePath = '/tmp/rename-fixtures.json';
const baselinePath = '/tmp/rename-baseline.json';
const run = 'rename' + Date.now();
const state = { run, users: [], teams: [], assets: [], objects: [], passwords: {} };
function checkpoint() { fs.writeFileSync(statePath, JSON.stringify(state)); }
async function call(session, workspace, method, path, body, status = 200, raw = false) {
  const headers = session ? { Authorization: 'Bearer ' + session.token } : {};
  if (workspace) headers['X-Workspace-Id'] = String(workspace);
  if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  const response = await fetch('http://127.0.0.1:3000/api' + path, { method, headers, body });
  if (raw) { assert.equal(response.status, status); return { bytes: Buffer.from(await response.arrayBuffer()), disposition: response.headers.get('content-disposition') }; }
  const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
}
async function account(label) {
  const password = 'Rename-test-2026!'; const email = `${run}-${label}@example.test`;
  const session = await call(null, null, 'POST', '/auth/register', { username: `${run}-${label}`, email, password }, 201);
  state.users.push(session.user.id); state.passwords[label] = { email, password }; checkpoint(); return session;
}
async function upload(session, workspace, model = false, filename = 'source.txt') {
  const form = new FormData();
  form.append('asset', new Blob([model ? 'mtllib model.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nusemtl paint\nf 1/1 2/2 3/3\n' : 'Rename acceptance file.'], { type: 'text/plain' }), model ? 'model.obj' : filename);
  if (model) {
    form.append('materials', new Blob(['newmtl paint\nKd 1 1 1\nmap_Kd texture.png\n']), 'model.mtl');
    form.append('textures', new Blob([await sharp({ create: { width: 2, height: 2, channels: 3, background: '#8866cc' } }).png().toBuffer()], { type: 'image/png' }), 'texture.png');
    form.append('resourcePaths', JSON.stringify([{ id: 'material', path: 'model.mtl', field: 'materials', index: 0 }, { id: 'texture', path: 'texture.png', field: 'textures', index: 0 }]));
  }
  const result = await call(session, workspace, 'POST', '/assets/upload', form, 201);
  state.assets.push(result.asset.id); checkpoint(); return result.asset;
}
async function fingerprint(assetId) {
  const asset = (await db.Asset.findByPk(assetId)).toJSON(); delete asset.displayName;
  const versions = await db.Version.findAll({ where: { assetId }, raw: true });
  const keys = asset.packageManifest?.files.map(file => file.objectKey) || [asset.filename];
  const files = [];
  for (const key of keys) {
    const chunks = []; for await (const chunk of await minioClient.getObject(BUCKET_NAME, key)) chunks.push(chunk);
    files.push([key, crypto.createHash('sha256').update(Buffer.concat(chunks)).digest('hex')]);
  }
  return { asset, versions, files, queue: await redis.lRange('ai_jobs', 0, -1) };
}
async function setup() {
  checkpoint();
  state.owner = await account('owner'); state.manager = await account('manager'); state.collaborator = await account('collaborator'); state.admin = await account('admin');
  await db.User.update({ role: 'systemAdministrator' }, { where: { id: state.admin.user.id } });
  const { team } = await call(state.owner, null, 'POST', '/teams', { name: run + ' studio' }, 201);
  state.workspace = team.id; state.teams.push(team.id); checkpoint();
  for (const member of [state.manager, state.collaborator]) await call(member, null, 'POST', '/teams/join', { inviteCode: team.inviteCode }, 201);
  await call(state.owner, team.id, 'PATCH', '/teams/current/members/' + state.manager.user.id, { role: 'workspaceManager' });
  const other = await call(state.owner, team.id, 'POST', '/teams', { name: run + ' other' }, 201); state.teams.push(other.team.id); checkpoint();
  state.plain = await upload(state.manager, team.id);
  state.model = await upload(state.owner, team.id, true);
  state.auto = await upload(state.manager, team.id, false, 'automatic.txt');
  const oldCount = Number(JSON.parse(fs.readFileSync(baselinePath)).Assets.count);
  assert.equal(await db.Asset.count({ where: { displayName: null } }), oldCount + 3);
  for (const asset of [state.plain, state.model]) {
    const before = await fingerprint(asset.id);
    const body = { displayName: '  展示名称 🐧  ', userId: state.manager.user.id, workspaceId: other.team.id, filename: 'evil', originalname: 'evil.fbx', metadata: {} };
    await call(state.manager, team.id, 'PATCH', `/assets/${asset.id}/name`, body, asset.id === state.plain.id ? 200 : 403);
    await call(state.owner, team.id, 'PATCH', `/assets/${asset.id}/name`, body);
    assert.deepEqual(await fingerprint(asset.id), before);
    assert.equal((await call(state.owner, team.id, 'GET', `/assets/${asset.id}/details`)).displayName, '展示名称 🐧');
    for (const session of [state.collaborator, state.admin]) await call(session, team.id, 'PATCH', `/assets/${asset.id}/name`, body, 403);
    await call(state.owner, other.team.id, 'PATCH', `/assets/${asset.id}/name`, body, 403);
    const download = await call(state.owner, team.id, 'GET', `/assets/download/${asset.id}`, null, 200, true);
    assert.ok(download.disposition.includes(asset.id === state.model.id ? 'model.zip' : 'source.txt'));
    if (asset.id === state.model.id) {
      assert.equal(download.bytes.slice(0,2).toString(), 'PK');
      const manifest = (await call(state.owner, team.id, 'GET', `/assets/${asset.id}/package`)).package;
      assert.equal(manifest.format, 'obj'); assert.equal(manifest.files.length, 3);
      for (const resource of manifest.files) assert.ok((await call(state.owner, team.id, 'GET', `/assets/${asset.id}/resources/${resource.id}?packageId=${manifest.packageId}`, null, 200, true)).bytes.length);
    }
  }
  for (const query of ['展示名称', 'source.txt', 'model.obj']) {
    const result = await call(state.owner, team.id, 'GET', '/assets/search?filename=' + encodeURIComponent(query) + '&pageSize=1');
    assert.equal(result.data.length, 1); assert.ok(result.totalItems >= 1); assert.ok(result.data[0].displayName);
    const outside = await call(state.owner, other.team.id, 'GET', '/assets/search?filename=' + encodeURIComponent(query)); assert.equal(outside.totalItems, 0);
  }
  const typed = await call(state.owner, team.id, 'GET', '/assets/search?filename=' + encodeURIComponent('展示名称') + '&type=model'); assert.equal(typed.totalItems, 1);
  const stats = await call(state.owner, team.id, 'GET', '/assets/dashboard/stats'); assert.equal(stats.recentUploads.find(asset=>asset.id===state.plain.id).displayName, '展示名称 🐧');
  const teamBefore = (await db.Team.findByPk(team.id)).toJSON();
  for (const session of [state.manager, state.collaborator, state.admin]) await call(session, team.id, 'PATCH', '/teams/current/name', { name: 'New name', workspaceId: other.team.id, role: 'workspaceOwner' }, 403);
  await call(state.owner, team.id, 'PATCH', '/teams/current/name', { name: '  Renaming acceptance studio 🐧  ', teamId: other.team.id, inviteCode: 'evil' });
  const teamAfter = (await db.Team.findByPk(team.id)).toJSON(); assert.deepEqual({ ...teamAfter, name: teamBefore.name, updatedAt: teamBefore.updatedAt }, teamBefore);
  assert.equal((await call(state.owner, team.id, 'GET', '/teams/current')).team.name, 'Renaming acceptance studio 🐧');
  for (const bad of [null, 42, '', ' ', 'abc\n', 'ab\u007f', 'a'.repeat(201)]) await call(state.owner, team.id, 'PATCH', `/assets/${state.plain.id}/name`, { displayName: bad }, 400);
  for (const id of [state.plain.id, state.auto.id]) {
    const form = new FormData(); form.append('asset', new Blob(['Replacement acceptance file.']), 'replacement.txt'); form.append('changeLog', 'Rename regression');
    const result = await call(state.manager, team.id, 'POST', `/assets/${id}/versions/upload`, form, 201);
    assert.equal(result.asset.displayName, id === state.plain.id ? '展示名称 🐧' : null); assert.equal(result.asset.originalname, 'replacement.txt'); assert.equal(result.version.originalName, id === state.plain.id ? 'source.txt' : 'automatic.txt');
  }
  const membership = { teamId: team.id, userId: state.manager.user.id };
  await db.TeamMember.update({ role: 'collaborator' }, { where: membership }); await call(state.manager, team.id, 'PATCH', `/assets/${state.plain.id}/name`, { displayName: 'No' }, 403);
  await db.TeamMember.destroy({ where: membership }); await call(state.manager, team.id, 'PATCH', `/assets/${state.plain.id}/name`, { displayName: 'No' }, 403);
  await db.TeamMember.create({ ...membership, role: 'workspaceManager' });
  await db.User.update({ isActive: false }, { where: { id: state.manager.user.id } }); await call(state.manager, team.id, 'PATCH', `/assets/${state.plain.id}/name`, { displayName: 'No' }, 403);
  await db.User.update({ isActive: true }, { where: { id: state.manager.user.id } });
  checkpoint(); console.log('Runtime rename, permissions, source/ZIP/resources, search, dashboard and replacement checks passed.');
  console.log(JSON.stringify({ run, workspace: state.workspace, plainId: state.plain.id, modelId: state.model.id, accounts: state.passwords }));
}
async function cleanup() {
  Object.assign(state, JSON.parse(fs.readFileSync(statePath)));
  for (const job of await redis.lRange('ai_jobs', 0, -1)) {
    const assetId = JSON.parse(job).assetId;
    if (state.assets.includes(assetId)) await redis.lRem('ai_jobs', 0, job);
  }
  for (const id of state.assets) {
    const asset = await db.Asset.findByPk(id); if (!asset) continue;
    const versions = await db.Version.findAll({ where: { assetId: id } });
    const packages = require('/app/src/utils/modelPackage');
    await packages.removeObjects([...packages.objectKeys(asset), ...versions.flatMap(packages.objectKeys)]);
    await db.Version.destroy({ where: { assetId: id } }); await db.Comment.destroy({ where: { assetId: id } }); await asset.destroy();
  }
  await db.TeamMember.destroy({ where: { teamId: state.teams } }); await db.Team.destroy({ where: { id: state.teams } }); await db.User.destroy({ where: { id: state.users } });
  console.log('Dedicated rename fixtures and queued jobs cleaned.');
}
(async()=>{ if(process.argv[2]==='cleanup') await cleanup(); else await setup(); await redis.quit(); await db.sequelize.close(); })().catch(error=>{ console.error(error); process.exit(1); });
