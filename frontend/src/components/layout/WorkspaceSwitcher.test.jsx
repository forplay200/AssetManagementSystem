import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import { teamService } from '../../services/teamService';

const mockActivateTeam = jest.fn();
let mockNames = {};

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 7, team: { id: 2, name: 'Northstar' }, teamRole: 'workspaceOwner' },
    activateTeam: mockActivateTeam, workspaceNames: mockNames,
  }),
}));

jest.mock('../../services/teamService', () => ({
  teamService: { list: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks(); mockNames = {};
  teamService.list.mockResolvedValue({ teams: [
    { id: 2, name: 'Northstar', role: 'workspaceOwner' },
    { id: 8, name: 'Side Quest', role: 'workspaceManager' },
  ] });
});

test('loads memberships and identifies the active workspace', async () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><WorkspaceSwitcher /></MemoryRouter>);
  const selector = await screen.findByRole('combobox', { name: /active workspace/i });
  expect(selector).toHaveValue('2');
  expect(screen.getByRole('option', { name: /side quest.*manager/i })).toBeInTheDocument();
  expect(screen.getByText(/workspace owner access/i)).toBeInTheDocument();
});

test('persists the selected workspace context before navigation', async () => {
  const onNavigate = jest.fn();
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><WorkspaceSwitcher onNavigate={onNavigate} /></MemoryRouter>);
  const selector = await screen.findByRole('combobox', { name: /active workspace/i });
  fireEvent.change(selector, { target: { value: '8' } });
  await waitFor(() => expect(mockActivateTeam).toHaveBeenCalledWith({ id: 8, name: 'Side Quest' }, 'workspaceManager'));
  expect(onNavigate).toHaveBeenCalled();
});

test('name overlay wins over a delayed old list response without refetching or selecting a workspace', async () => {
  let resolve; teamService.list.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const view = render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><WorkspaceSwitcher /></MemoryRouter>);
  mockNames = { 2: 'Updated workspace' }; view.rerender(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><WorkspaceSwitcher /></MemoryRouter>);
  await require('@testing-library/react').act(async () => resolve({ teams: [{ id: 2, name: 'Old workspace', role: 'workspaceOwner' }] }));
  expect(screen.getByRole('option', { name: /Updated workspace/ })).toBeInTheDocument();
  expect(teamService.list).toHaveBeenCalledTimes(1); expect(mockActivateTeam).not.toHaveBeenCalled();
});
