import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import RecycleBinPage from './RecycleBinPage';
import { recycleBinService } from '../services/recycleBinService';
import { assetService } from '../services/assetService';
jest.mock('../services/recycleBinService', () => ({ recycleBinService: { list: jest.fn(), restore: jest.fn() } }));
jest.mock('../services/assetService', () => ({ assetService: { getPreview: jest.fn() } }));
const cycle = { id: 'cycle-one', assetId: 7, targetName: 'city.png', uploaderName: 'Ben', deletedByName: 'Alice', deletedAt: new Date().toISOString(), purgeAfter: new Date(Date.now() + 604800000).toISOString(), status: 'trashed', reason: 'Duplicate', canRestore: false, canObject: true };
const result = cycles => ({ cycles, total: cycles.length, pageSize: 30 });
const mount = path => render(<MemoryRouter initialEntries={[path || '/recycle-bin']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><RecycleBinPage /></MemoryRouter>);
beforeEach(() => { jest.clearAllMocks(); recycleBinService.list.mockResolvedValue(result([cycle])); recycleBinService.restore.mockResolvedValue({ restored: true }); });
test('uploader can object and restore the exact deletion cycle without Owner approval', async () => {
  const user = userEvent.setup(); mount();
  await user.click(await screen.findByRole('button', { name: 'Object and restore' }));
  expect(screen.queryByRole('button', { name: 'Restore', exact: true })).not.toBeInTheDocument();
  recycleBinService.list.mockResolvedValue(result([]));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Object and restore' }));
  await waitFor(() => expect(recycleBinService.restore).toHaveBeenCalledWith(7, 'cycle-one', true));
  expect(await screen.findByText('Asset restored.')).toBeInTheDocument();
});
test('purging and failed cleanup show status without any early permanent-delete button', async () => {
  recycleBinService.list.mockResolvedValue(result([{ ...cycle, status: 'purging', canObject: false, cleanup: { status: 'failed', nextAttemptAt: new Date().toISOString() } }]));
  mount(); expect(await screen.findByText(/Cleanup failed/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Object and restore|Permanently delete|Empty bin/i })).not.toBeInTheDocument();
});
test('notification links request a specific deletion cycle and explain already-ended cycles', async () => {
  recycleBinService.list.mockResolvedValue(result([])); mount('/recycle-bin?cycle=old-cycle');
  expect(await screen.findByText(/linked deletion may already have ended/i)).toBeInTheDocument();
  expect(recycleBinService.list).toHaveBeenCalledWith({ page: 1, cycleId: 'old-cycle' });
});
test('self-deleted asset opens a protected preview alongside ordinary Restore', async () => {
  const user = userEvent.setup();
  const create = URL.createObjectURL;
  const revoke = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn(() => 'blob:deleted-image');
  URL.revokeObjectURL = jest.fn();
  try {
    assetService.getPreview.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    recycleBinService.list.mockResolvedValue(result([{
      ...cycle, deletedByName: 'Ben', canObject: false, canRestore: true,
      preview: { originalname: 'city.png', mimetype: 'image/png', size: 5 }
    }]));
    mount();
    expect(await screen.findByRole('button', { name: 'Restore', exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Object and restore' })).not.toBeInTheDocument();
    expect(assetService.getPreview).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await within(screen.getByRole('dialog', { name: 'city.png' })).findByRole('img')).toHaveAttribute('src', 'blob:deleted-image');
    expect(assetService.getPreview).toHaveBeenCalledWith(7, expect.any(AbortSignal), { recycleCycleId: 'cycle-one' });
    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:deleted-image');
  } finally {
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
  }
});
