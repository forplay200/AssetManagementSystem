import { render, screen } from '@testing-library/react';
import UserManagementPage from './UserManagementPage';
import { userService } from '../services/userService';

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'admin', accountRole: 'admin' } }),
}));

jest.mock('../services/userService', () => ({
  userService: { list: jest.fn() },
}));

test('separates legacy system administration from team membership management', async () => {
  userService.list.mockResolvedValue([]);
  render(<UserManagementPage />);
  expect(await screen.findByRole('heading', { name: 'System Users' })).toBeInTheDocument();
  expect(screen.getByText(/workspace membership is managed from the team screen/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /add system user/i })).toBeInTheDocument();
});
