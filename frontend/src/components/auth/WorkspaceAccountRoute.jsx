import { Navigate } from 'react-router-dom';
import { isSystemAdministrator } from '../../auth/roles';
import { useAuth } from '../../context/AuthContext';

export default function WorkspaceAccountRoute({ children }) {
  const { user } = useAuth();
  return isSystemAdministrator(user) ? <Navigate to="/admin/users" replace /> : children;
}
