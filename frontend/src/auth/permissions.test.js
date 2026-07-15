import { hasPermission } from './permissions';

test('only administrators can manage users', () => {
  expect(hasPermission('admin', 'manageUsers')).toBe(true);
  expect(hasPermission('developer', 'manageUsers')).toBe(false);
  expect(hasPermission('designer', 'manageUsers')).toBe(false);
  expect(hasPermission('collaborator', 'manageUsers')).toBe(false);
});

test('collaborators cannot perform asset management actions', () => {
  expect(hasPermission('collaborator', 'uploadAsset')).toBe(false);
  expect(hasPermission('collaborator', 'deleteAsset')).toBe(false);
  expect(hasPermission('collaborator', 'comment')).toBe(true);
});

test('workspace roles follow the proposed team permission boundaries', () => {
  expect(hasPermission('owner', 'manageTeam')).toBe(true);
  expect(hasPermission('owner', 'deleteAsset')).toBe(true);
  expect(hasPermission('manager', 'manageMetadata')).toBe(true);
  expect(hasPermission('manager', 'deleteAsset')).toBe(false);
  expect(hasPermission('collaborator', 'downloadAsset')).toBe(true);
  expect(hasPermission('user', 'viewAsset')).toBe(false);
});
