import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RouteAccessibility, { pageName } from './RouteAccessibility';

test('maps workspace paths to concise page names', () => {
  expect(pageName('/dashboard')).toBe('Dashboard');
  expect(pageName('/assets/42')).toBe('Asset Details');
  expect(pageName('/workspace')).toBe('Workspace Setup');
  expect(pageName('/team')).toBe('Team Workspace');
  expect(pageName('/admin/users')).toBe('System User Administration');
  expect(pageName('/unknown')).toBe('Page Not Found');
});

test('updates the document title and announces the route', async () => {
  render(<MemoryRouter initialEntries={['/search']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><main id="main-content" tabIndex="-1" /><RouteAccessibility /></MemoryRouter>);
  expect(screen.getByRole('status')).toHaveTextContent('Search Assets');
  await waitFor(() => expect(document.title).toBe('Search Assets · Aether'));
});
