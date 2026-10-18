import { canManageAsset, canDeleteAsset, canManageWorkspaceVocabulary } from './assetPermissions';

const user = { id: 2, accountRole: 'user', role: 'workspaceManager', teamRole: 'workspaceManager', team: { id: 8 } };
const asset = { workspaceId: 8, userId: 2 };
test('manager ownership restricts asset writes but preserves workspace vocabulary', () => {
  expect(canManageAsset(user, asset)).toBe(true);
  expect(canDeleteAsset(user, asset)).toBe(true);
  const otherAsset = { ...asset, userId: 3, createdBy: 2 };
  expect(canManageAsset(user, otherAsset)).toBe(false);
  expect(canDeleteAsset(user, otherAsset)).toBe(false);
  expect(canManageWorkspaceVocabulary(user, otherAsset)).toBe(true);
  expect(canManageAsset({ ...user, id: '2', team: { id: '8' } }, { workspaceId: '8', userId: '2' })).toBe(true);
  expect(canManageAsset({ ...user, teamRole: 'workspaceOwner' }, otherAsset)).toBe(true);
});
test('permissions fail closed for unknown, invalid, inactive, downgraded, or mismatched contexts', () => {
  for (const check of [canManageAsset, canDeleteAsset, canManageWorkspaceVocabulary]) {
    expect(check(user, { ...asset, workspaceId: 9 })).toBe(false);
    expect(check(user, { userId: 2, teamId: 8 })).toBe(false);
    expect(check({ ...user, team: null }, asset)).toBe(false);
    expect(check({ ...user, teamRole: 'collaborator' }, asset)).toBe(false);
    expect(check({ ...user, accountRole: 'systemAdministrator' }, asset)).toBe(false);
    expect(check({ ...user, isActive: false }, asset)).toBe(false);
    expect(check(null, asset)).toBe(false);
  }
  for (const id of [null, undefined, '', ' ', 0, '0', true, [], {}, '1e2']) {
    expect(canManageAsset({ ...user, id }, { ...asset, userId: id })).toBe(false);
    expect(canManageAsset(user, { ...asset, userId: id })).toBe(false);
  }
});
