import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AppShell from './AppShell';

let mockRole = 'systemAdministrator';
const mockRefreshTeam = jest.fn();

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'tester', role: mockRole, accountRole: mockRole, teamRole: ['owner', 'manager', 'collaborator'].includes(mockRole) ? mockRole : null, team: ['owner', 'manager', 'collaborator'].includes(mockRole) ? { id: 4, name: 'Studio' } : null }, logout: jest.fn(), refreshTeam: mockRefreshTeam }),
}));
jest.mock('../../hooks/usePermissions', () => ({ usePermissions: () => {
  const { hasPermission } = jest.requireActual('../../auth/permissions');
  return { can: (permission) => hasPermission(mockRole, permission), role: mockRole };
} }));
jest.mock('./WorkspaceSwitcher', () => () => <div>Workspace switcher</div>);
jest.mock('../common/SystemStatus', () => () => <div>System status</div>);
jest.mock('../common/BrandMark', () => () => <div>Aether</div>);

function renderShell() {
  return render(<MemoryRouter initialEntries={['/']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route element={<AppShell />}><Route path="/" element={<div>Content</div>} /></Route></Routes></MemoryRouter>);
}

test('System Administrator sees only the platform module in main navigation', () => {
  mockRole = 'systemAdministrator';
  renderShell();
  expect(screen.getByRole('link', { name: /system users/i })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /^team$/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /^assets$/i })).not.toBeInTheDocument();
  expect(screen.queryByText('Workspace switcher')).not.toBeInTheDocument();
});

test.each(['owner', 'manager', 'collaborator', 'user'])('%s cannot see System Administration navigation', (role) => {
  mockRole = role;
  const view = renderShell();
  expect(screen.queryByRole('link', { name: /system users/i })).not.toBeInTheDocument();
  view.unmount();
});
