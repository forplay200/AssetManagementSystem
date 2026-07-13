import { render, screen } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

function BrokenComponent() {
  throw new Error('Render failed');
}

test('shows a recoverable fallback for unhandled render errors', () => {
  const originalError = console.error;
  console.error = () => {};
  render(<ErrorBoundary><BrokenComponent /></ErrorBoundary>);
  expect(screen.getByRole('heading', { name: /workspace hit an error/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /reload workspace/i })).toBeInTheDocument();
  console.error = originalError;
});
