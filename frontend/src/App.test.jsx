import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import App from './App';

function renderAt(path) {
  return render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AuthProvider><App /></AuthProvider></MemoryRouter>);
}

test('renders the login screen for signed-out users', () => {
  localStorage.clear();
  renderAt('/login');
  expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
});

test('renders unassigned user registration fields', () => {
  localStorage.clear();
  renderAt('/register');
  expect(screen.getByRole('heading', { name: /build with your team/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
});

test('explains unavailable recovery without exposing a reset form', () => {
  localStorage.clear();
  renderAt('/forgot-password');
  expect(screen.getByRole('heading', { name: /password recovery/i })).toBeInTheDocument();
  expect(screen.getByText(/email password recovery is not available/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();
});

test('legacy reset URLs cannot offer an unsafe password reset', () => {
  localStorage.clear();
  renderAt('/reset-password');
  expect(screen.getByText(/email password recovery is not available/i)).toBeInTheDocument();
});
