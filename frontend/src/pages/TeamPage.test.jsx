import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeamPage from './TeamPage';
import { teamService } from '../services/teamService';

const mockActivateTeam = jest.fn();
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 }, activateTeam: mockActivateTeam }) }));
jest.mock('../hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => true, role: 'workspaceOwner' }) }));
jest.mock('../services/teamService', () => ({ teamService: { current: jest.fn(), updateMemberRole: jest.fn(), removeMember: jest.fn(), regenerateInviteCode: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  teamService.current.mockResolvedValue({ role: 'workspaceOwner', team: { id: 4, name: 'Studio', inviteCode: 'OLD-CODE', members: [{ id: 2, username: 'Alex', role: 'collaborator' }] } });
});

test('cancelling role changes preserves existing access', async () => {
  const user = userEvent.setup();
  render(<TeamPage />);
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Role for Alex' }), 'workspaceManager');
  expect(teamService.updateMemberRole).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('combobox', { name: 'Role for Alex' })).toHaveValue('collaborator');
  expect(teamService.updateMemberRole).not.toHaveBeenCalled();
});

test('invitation rotation shows its impact and only changes the code after confirmation', async () => {
  teamService.regenerateInviteCode.mockResolvedValue({ inviteCode: 'NEW-CODE' });
  const user = userEvent.setup();
  render(<TeamPage />);
  await user.click(await screen.findByRole('button', { name: 'Rotate code' }));
  expect(screen.getByText(/old code will stop working immediately/i)).toBeInTheDocument();
  expect(teamService.regenerateInviteCode).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Rotate code' }));
  expect(await screen.findByText('NEW-CODE')).toBeInTheDocument();
  expect(teamService.regenerateInviteCode).toHaveBeenCalledTimes(1);
});
