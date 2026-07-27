import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserManagementPage from './UserManagementPage';
import { userService } from '../services/userService';

jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'systemAdministrator', accountRole: 'systemAdministrator' } }) }));
jest.mock('../services/userService', () => ({ userService: { list: jest.fn(), get: jest.fn(), setStatus: jest.fn() } }));

const admin = { id: 1, username: 'platform-admin', email: 'admin@example.com', role: 'systemAdministrator', isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
const member = { id: 2, username: 'alex', email: 'alex@example.com', role: 'user', isActive: true, createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z' };

beforeEach(() => {
  jest.clearAllMocks();
  userService.list.mockResolvedValue([admin, member]);
  userService.get.mockResolvedValue({ ...member, teamMemberships: [{ id: 9, role: 'manager', createdAt: '2026-02-02T00:00:00Z', team: { id: 4, name: 'Studio One' } }] });
  userService.setStatus.mockResolvedValue({ user: { ...member, isActive: false } });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => { jest.restoreAllMocks(); });

test('renders system users with account status and no legacy create/delete controls', async () => {
  render(<UserManagementPage />);
  expect(await screen.findByRole('heading', { name: 'System Users' })).toBeInTheDocument();
  expect(screen.getAllByText('System Administrator')).not.toHaveLength(0);
  expect(within(screen.getByRole('table')).getAllByText('Active')).toHaveLength(2);
  expect(screen.queryByRole('button', { name: /add system user/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /delete alex/i })).not.toBeInTheDocument();
});

test('search sends text, status, and role filters to the backend', async () => {
  const user = userEvent.setup();
  render(<UserManagementPage />);
  await screen.findByText('alex');
  await user.type(screen.getByRole('textbox', { name: 'Search users' }), 'alex');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by account status' }), 'active');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by account role' }), 'user');
  await user.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() => expect(userService.list).toHaveBeenLastCalledWith({ q: 'alex', status: 'active', role: 'user' }));
});

test('user details show account and read-only workspace role assignments', async () => {
  const user = userEvent.setup();
  render(<UserManagementPage />);
  await screen.findByText('alex');
  const detailButtons = screen.getAllByRole('button', { name: 'Details' });
  await user.click(detailButtons[1]);
  expect(await screen.findByRole('dialog', { name: 'alex' })).toBeInTheDocument();
  expect(screen.getByText('Studio One')).toBeInTheDocument();
  expect(screen.getByText('Manager')).toBeInTheDocument();
  expect(userService.get).toHaveBeenCalledWith(2);
});

test('deactivation uses account status instead of deleting the user', async () => {
  const user = userEvent.setup();
  render(<UserManagementPage />);
  await screen.findByText('alex');
  const deactivateButtons = screen.getAllByRole('button', { name: 'Deactivate' });
  expect(deactivateButtons[0]).toBeDisabled();
  await user.click(deactivateButtons[1]);
  expect(window.confirm).toHaveBeenCalled();
  await waitFor(() => expect(userService.setStatus).toHaveBeenCalledWith(2, 'inactive'));
  expect(await screen.findByText(/account is now inactive/i)).toBeInTheDocument();
});

test('inactive accounts expose an Activate action', async () => {
  userService.list.mockResolvedValue([{ ...member, isActive: false }]);
  userService.setStatus.mockResolvedValue({ user: { ...member, isActive: true } });
  const user = userEvent.setup();
  render(<UserManagementPage />);
  await user.click(await screen.findByRole('button', { name: 'Activate' }));
  await waitFor(() => expect(userService.setStatus).toHaveBeenCalledWith(2, 'active'));
});
