import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import UploadPage from './UploadPage';
jest.mock('../context/UnsavedChangesContext', () => ({ useUnsavedChanges: () => jest.fn() }));
jest.mock('../services/assetService', () => ({ assetService: {} }));
test('new upload accepts exactly 100 MiB WebM while preserving the non-video 50 MiB bound', async () => {
  render(<MemoryRouter><UploadPage /></MemoryRouter>);
  const input = screen.getByLabelText('Asset file');
  expect(input.accept).toContain('.webm');
  const user = userEvent.setup();
  const edge = new File(['virtual-size fixture'], 'edge.webm'); Object.defineProperty(edge, 'size', { value: 100 * 1048576 });
  await user.upload(input, edge); expect(screen.getByText('edge.webm')).toBeInTheDocument();
  for (const [name, size] of [['over.webm', 100 * 1048576 + 1], ['large.txt', 50 * 1048576 + 1]]) {
    const file = new File(['virtual-size fixture'], name); Object.defineProperty(file, 'size', { value: size });
    await user.upload(input, file);
    expect(screen.getByText(/Video files allow up to 100 MiB/)).toBeInTheDocument();
  }
  expect(screen.getByText('edge.webm')).toBeInTheDocument();
});
