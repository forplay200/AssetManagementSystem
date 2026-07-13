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
