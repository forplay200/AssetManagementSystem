export const SYSTEM_ADMINISTRATOR_ROLES = ['systemAdministrator', 'admin'];

export function isSystemAdministrator(value) {
  const role = typeof value === 'string' ? value : value?.accountRole || value?.role;
  return SYSTEM_ADMINISTRATOR_ROLES.includes(role);
}

export function accountRoleLabel(role) {
  if (SYSTEM_ADMINISTRATOR_ROLES.includes(role)) return 'System Administrator';
  if (role === 'user') return 'User';
  return role ? role[0].toUpperCase() + role.slice(1) : 'User';
}
