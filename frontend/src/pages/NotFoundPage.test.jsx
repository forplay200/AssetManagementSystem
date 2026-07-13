import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFoundPage from './NotFoundPage';

test('offers useful recovery actions for unknown workspace routes', () => {
  render(<MemoryRouter initialEntries={['/missing-page']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><NotFoundPage /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  expect(screen.getByText('/missing-page')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard');
});
