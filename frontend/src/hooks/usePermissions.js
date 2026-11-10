import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { hasPermission } from '../auth/permissions';
import { ACCOUNT_ROLES } from '../auth/roles';

export function usePermissions() {
  const { user } = useAuth();
  const role = user?.teamRole || user?.role || ACCOUNT_ROLES.USER;
  const can = useCallback((permission) => hasPermission(role, permission)
    || (permission === 'manageUsers' && hasPermission(user?.accountRole, permission)), [role, user?.accountRole]);
  return { can, role };
}
