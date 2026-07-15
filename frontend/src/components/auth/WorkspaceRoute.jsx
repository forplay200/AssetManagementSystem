import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function WorkspaceRoute() {
  const { user } = useAuth();
  const location = useLocation();
  const isUnassignedUser = user?.role === 'user' && !user?.team;
  return isUnassignedUser
    ? <Navigate to="/workspace" state={{ from: location }} replace />
    : <Outlet />;
}
