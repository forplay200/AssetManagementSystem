import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, isTokenExpired, useAuth } from './AuthContext';
import { readStoredSession, writeStoredSession, clearStoredSession } from '../auth/authStorage';
import { teamService } from '../services/teamService';

jest.mock('../services/authService', () => ({ authService: { logout: jest.fn().mockResolvedValue() } }));

jest.mock('../services/teamService', () => ({ teamService: { current: jest.fn() } }));
afterEach(() => { clearStoredSession(); jest.clearAllMocks(); });

function tokenWithExpiry(exp) {
  const payload = btoa(JSON.stringify({ exp })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `header.${payload}.signature`;
}

test('recognizes active and expired JWT sessions', () => {
  const now = 2_000_000_000_000;
  expect(isTokenExpired(tokenWithExpiry(now / 1000 + 60), now)).toBe(false);
  expect(isTokenExpired(tokenWithExpiry(now / 1000 - 1), now)).toBe(true);
});

test('treats malformed tokens as expired', () => {
  expect(isTokenExpired('not-a-token')).toBe(true);
});

function WorkspaceProbe() {
  const { user, activateTeam } = useAuth();
  return <><p>{user?.team?.name || 'No workspace'} / {user?.teamRole}</p><button onClick={() => activateTeam({ id: 9, name: 'Other workspace' }, 'workspaceOwner')}>Switch workspace</button></>;
}
function startProvider() {
  writeStoredSession({ token: tokenWithExpiry(Date.now() / 1000 + 3600), user: { id: 2, accountRole: 'user', role: 'workspaceManager', teamRole: 'workspaceManager', team: { id: 8, name: 'Original workspace' } } });
  render(<AuthProvider><WorkspaceProbe /></AuthProvider>);
}
test('asset permission failures refresh the membership role and stored session', async () => {
  teamService.current.mockResolvedValue({ team: { id: 8, name: 'Original workspace' }, role: 'collaborator' }); startProvider();
  act(() => window.dispatchEvent(new Event('aether:workspace-permissions-changed')));
  expect(await screen.findByText('Original workspace / collaborator')).toBeInTheDocument();
  expect(readStoredSession().user.teamRole).toBe('collaborator');
});
test.each([false, true])('a delayed permission refresh cannot reactivate a previous workspace (failure=%s)', async failure => {
  let complete;
  teamService.current.mockImplementation(() => new Promise((resolve, reject) => { complete = failure ? () => reject({ response: { status: 403 } }) : () => resolve({ team: { id: 8, name: 'Original workspace' }, role: 'collaborator' }); }));
  startProvider(); act(() => window.dispatchEvent(new Event('aether:workspace-permissions-changed')));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Switch workspace' }));
  await act(async () => { complete(); });
  expect(screen.getByText('Other workspace / workspaceOwner')).toBeInTheDocument();
  expect(readStoredSession().user.team.id).toBe(9);
});

let capturedAuth;
function NameProbe() {
  const auth = useAuth(); capturedAuth = auth;
  return <><WorkspaceProbe /><p>List: {auth.workspaceNames[8] || 'none'}</p></>;
}
function startNameProvider() {
  writeStoredSession({ token: tokenWithExpiry(Date.now() / 1000 + 3600), user: { id: 2, accountRole: 'user', role: 'workspaceOwner', teamRole: 'workspaceOwner', team: { id: 8, name: 'Original workspace' } } });
  render(<AuthProvider><NameProbe /></AuthProvider>);
}
test('rename synchronizes session without changing token/roles, and wins over an older refresh response', async () => {
  let resolve; teamService.current.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  startNameProvider(); const before = readStoredSession();
  act(() => { capturedAuth.refreshTeam(); });
  act(() => capturedAuth.updateWorkspaceName({ id: 8, name: 'Renamed studio' }, before.token));
  expect(readStoredSession()).toEqual({ ...before, user: { ...before.user, team: { id: 8, name: 'Renamed studio' } } });
  await act(async () => resolve({ team: { id: 8, name: 'Original workspace' }, role: 'workspaceOwner' }));
  expect(screen.getByText('Renamed studio / workspaceOwner')).toBeInTheDocument();
  expect(readStoredSession().user.team.name).toBe('Renamed studio');
  teamService.current.mockResolvedValueOnce({ team: { id: 8, name: 'Renamed by another owner' }, role: 'workspaceOwner' });
  await act(async () => capturedAuth.refreshTeam());
  expect(readStoredSession().user.team.name).toBe('Renamed by another owner');
});
test('late rename after switching updates only its list entry; after logout it cannot restore session', async () => {
  startNameProvider(); const token = capturedAuth.token;
  await userEvent.setup().click(screen.getByText('Switch workspace'));
  act(() => capturedAuth.updateWorkspaceName({ id: 8, name: 'Renamed old workspace' }, token));
  expect(readStoredSession().user.team.id).toBe(9); expect(screen.getByText('List: Renamed old workspace')).toBeInTheDocument();
  const update = capturedAuth.updateWorkspaceName;
  await act(async () => capturedAuth.logout());
  act(() => update({ id: 8, name: 'Late rename' }, token));
  expect(readStoredSession()).toBeNull(); expect(screen.getByText('List: none')).toBeInTheDocument();
});
