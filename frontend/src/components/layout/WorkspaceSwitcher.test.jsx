import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import { teamService } from '../../services/teamService';

const mockActivateTeam = jest.fn();

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 7, team: { id: 2, name: 'Northstar' }, teamRole: 'owner' },
    activateTeam: mockActivateTeam,
  }),
}));

jest.mock('../../services/teamService', () => ({
  teamService: { list: jest.fn() },
}));

beforeEach(() => {
  mockActivateTeam.mockClear();
  teamService.list.mockResolvedValue({ teams: [
    { id: 2, name: 'Northstar', role: 'owner' },
    { id: 8, name: 'Side Quest', role: 'manager' },
  ] });
});

test('loads memberships and identifies the active workspace', async () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><WorkspaceSwitcher /></MemoryRouter>);
  const selector = await screen.findByRole('combobox', { name: /active workspace/i });
  expect(selector).toHaveValue('2');
  expect(screen.getByRole('option', { name: /side quest.*manager/i })).toBeInTheDocument();
  expect(screen.getByText(/owner access/i)).toBeInTheDocument();
});

test('persists the selected workspace context before navigation', async () => {
  const onNavigate = jest.fn();
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><WorkspaceSwitcher onNavigate={onNavigate} /></MemoryRouter>);
  const selector = await screen.findByRole('combobox', { name: /active workspace/i });
  fireEvent.change(selector, { target: { value: '8' } });
  await waitFor(() => expect(mockActivateTeam).toHaveBeenCalledWith({ id: 8, name: 'Side Quest' }, 'manager'));
  expect(onNavigate).toHaveBeenCalled();
});
