import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import RegisterPage from './RegisterPage';
import api from '../services/api';
const mockRegister = jest.fn();
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: false, register: mockRegister }) }));
jest.mock('../services/api', () => ({ __esModule: true, default: { get: jest.fn() }, getApiError: (_error, fallback) => fallback }));
const mount = () => render(<MemoryRouter><RegisterPage /></MemoryRouter>);
beforeEach(() => { jest.clearAllMocks(); api.get.mockResolvedValue({ data: { mode: 'open' } }); });
test('public community registration needs no access code or manual approval', async () => {
  const user = userEvent.setup(); mount();
  await screen.findByText(/keep your password safe/i);
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/auth/registration-policy'));
  expect(screen.queryByLabelText(/trial access code/i)).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('Username'), 'visitor');
  await user.type(screen.getByLabelText('Email address'), 'visitor@example.test');
  await user.type(screen.getByLabelText('Password', { exact: true }), 'long-test-password');
  await user.type(screen.getByLabelText('Confirm password'), 'long-test-password');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  expect(mockRegister).toHaveBeenCalledWith({ username: 'visitor', email: 'visitor@example.test', password: 'long-test-password', inviteCode: '' });
});
test('paused registration disables signup but provides sign in', async () => {
  api.get.mockResolvedValue({ data: { mode: 'closed' } }); mount();
  expect(await screen.findByText(/registrations are temporarily paused/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
  expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
});
test('optional access code is shown only when server enables it', async () => {
  api.get.mockResolvedValue({ data: { mode: 'invite' } }); mount();
  expect(await screen.findByLabelText(/trial access code/i)).toBeRequired();
});
