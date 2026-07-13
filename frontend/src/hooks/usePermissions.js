import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { hasPermission } from '../auth/permissions';

export function usePermissions() {
  const { user } = useAuth();
  const can = useCallback((permission) => hasPermission(user?.role, permission), [user?.role]);
  return { can, role: user?.role || 'collaborator' };
}
