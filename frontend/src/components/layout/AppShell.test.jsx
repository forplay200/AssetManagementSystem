import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AppShell from './AppShell';
import { UnsavedChangesProvider, useUnsavedChanges } from '../../context/UnsavedChangesContext';

let mockRole = 'systemAdministrator';
let mockTeamId = 4;
const mockRefreshTeam = jest.fn();
const mockLogout = jest.fn();

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'tester', role: mockRole, accountRole: mockRole === 'systemAdministrator' ? mockRole : 'user', teamRole: ['workspaceOwner', 'workspaceManager', 'collaborator'].includes(mockRole) ? mockRole : null, team: ['workspaceOwner', 'workspaceManager', 'collaborator'].includes(mockRole) ? { id: mockTeamId, name: 'Studio' } : null }, logout: mockLogout, refreshTeam: mockRefreshTeam }),
}));
jest.mock('../../hooks/usePermissions', () => ({ usePermissions: () => {
  const { hasPermission } = jest.requireActual('../../auth/permissions');
  return { can: (permission) => hasPermission(mockRole, permission), role: mockRole };
} }));
jest.mock('./WorkspaceSwitcher', () => () => <div>Workspace switcher</div>);
jest.mock('../common/SystemStatus', () => () => <div>System status</div>);
jest.mock('../common/BrandMark', () => () => <div>Aether</div>);

function renderShell(content = <div>Content</div>) {
  return render(<MemoryRouter initialEntries={['/']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><UnsavedChangesProvider><Routes><Route element={<AppShell />}><Route path="/" element={content} /></Route></Routes></UnsavedChangesProvider></MemoryRouter>);
}

function UnsavedDraft() {
  useUnsavedChanges(true, 'Comment draft');
  return <div>Draft</div>;
}

test.each([false, true])('log out always requires confirmation, with unsaved changes warning when applicable (%s)', async dirty => {
  mockRole = 'workspaceOwner';
  mockLogout.mockClear();
  renderShell(dirty ? <UnsavedDraft /> : undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
  const dialog = screen.getByRole('dialog', { name: 'Log out?' });
  expect(Boolean(within(dialog).queryByText('Comment draft'))).toBe(dirty);
  expect(mockLogout).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Stay signed in' }));
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
  expect(mockLogout).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Log out?' })).getByRole('button', { name: 'Log out' }));
  await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
});

test('System Administrator sees only the platform module in main navigation', () => {
  mockRole = 'systemAdministrator';
  renderShell();
  expect(screen.getByRole('link', { name: /system users/i })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /^team$/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /^assets$/i })).not.toBeInTheDocument();
  expect(screen.queryByText('Workspace switcher')).not.toBeInTheDocument();
});

test.each(['workspaceOwner', 'workspaceManager', 'collaborator', 'user'])('%s cannot see System Administration navigation', (role) => {
  mockRole = role;
  const view = renderShell();
  expect(screen.queryByRole('link', { name: /system users/i })).not.toBeInTheDocument();
  view.unmount();
});

function WorkspaceContent() {
  const [draft, setDraft] = useState('');
  return <input aria-label="Workspace draft" value={draft} onChange={event => setDraft(event.target.value)} />;
}

test('changing workspace resets its routed content even at the same URL', () => {
  mockRole = 'workspaceOwner';
  mockTeamId = 4;
  const content = () => <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route element={<AppShell />}><Route path="/" element={<WorkspaceContent />} /></Route></Routes></MemoryRouter>;
  const { rerender } = render(content());
  fireEvent.change(screen.getByRole('textbox', { name: 'Workspace draft' }), { target: { value: 'Workspace A content' } });
  mockTeamId = 8;
  rerender(content());
  expect(screen.getByRole('textbox', { name: 'Workspace draft' })).toHaveValue('');
  mockTeamId = 4;
});
