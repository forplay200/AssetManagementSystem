import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isSystemAdministrator } from '../../auth/roles';
import { useAuth } from '../../context/AuthContext';

export default function WorkspaceRoute() {
  const { user } = useAuth();
  const location = useLocation();
  if (isSystemAdministrator(user)) return <Navigate to="/admin/users" replace />;
  const isUnassignedUser = user?.role === 'user' && !user?.team;
  return isUnassignedUser
    ? <Navigate to="/workspace" state={{ from: location }} replace />
    : <Outlet />;
}
