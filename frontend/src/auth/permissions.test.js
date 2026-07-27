import { hasPermission } from './permissions';

test('only System Administrators can manage system users', () => {
  expect(hasPermission('systemAdministrator', 'manageUsers')).toBe(true);
  expect(hasPermission('admin', 'manageUsers')).toBe(true);
  expect(hasPermission('owner', 'manageUsers')).toBe(false);
  expect(hasPermission('manager', 'manageUsers')).toBe(false);
  expect(hasPermission('developer', 'manageUsers')).toBe(false);
  expect(hasPermission('designer', 'manageUsers')).toBe(false);
  expect(hasPermission('collaborator', 'manageUsers')).toBe(false);
  expect(hasPermission('user', 'manageUsers')).toBe(false);
  expect(hasPermission('systemAdministrator', 'viewAsset')).toBe(false);
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
