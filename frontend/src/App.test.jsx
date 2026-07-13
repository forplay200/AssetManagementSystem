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
  expect(screen.getByRole('button', { name: /sign in to aether/i })).toBeInTheDocument();
});

test('renders collaborator registration fields', () => {
  localStorage.clear();
  renderAt('/register');
  expect(screen.getByRole('heading', { name: /join the workspace/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
});

test('renders the password recovery form', () => {
  localStorage.clear();
  renderAt('/forgot-password');
  expect(screen.getByRole('heading', { name: /reset your password/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
});

test('rejects reset links without a token', () => {
  localStorage.clear();
  renderAt('/reset-password');
  expect(screen.getByText(/missing its secure token/i)).toBeInTheDocument();
});
