import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import ProtectedRoute from './components/auth/ProtectedRoute';
import PermissionRoute from './components/auth/PermissionRoute';
import WorkspaceRoute from './components/auth/WorkspaceRoute';
import AssetDetailPage from './pages/AssetDetailPage';
import AssetsPage from './pages/AssetsPage';
import DashboardPage from './pages/DashboardPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import LoginPage from './pages/LoginPage';
import ProfilePage from './pages/ProfilePage';
import SearchPage from './pages/SearchPage';
import RegisterPage from './pages/RegisterPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import UploadPage from './pages/UploadPage';
import UserManagementPage from './pages/UserManagementPage';
import TeamPage from './pages/TeamPage';
import WorkspaceSetupPage from './pages/WorkspaceSetupPage';
import NotFoundPage from './pages/NotFoundPage';
import RouteAccessibility from './components/common/RouteAccessibility';

export default function App() {
  return (
    <>
      <a href="#main-content" className="fixed left-4 top-3 z-[100] -translate-y-20 rounded bg-aether-primary px-4 py-2 text-sm font-medium text-white transition focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-white">Skip to main content</a>
      <RouteAccessibility />
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/workspace" element={<WorkspaceSetupPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route element={<WorkspaceRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/assets/:assetId" element={<AssetDetailPage />} />
            <Route path="/upload" element={<PermissionRoute permission="uploadAsset"><UploadPage /></PermissionRoute>} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/team" element={<TeamPage />} />
          </Route>
          <Route path="/admin/users" element={<PermissionRoute permission="manageUsers"><UserManagementPage /></PermissionRoute>} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  );
}
