import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VersionHistory from './VersionHistory';
import { assetService } from '../../services/assetService';

jest.mock('../assets/ThreeModelPreview', () => () => <div>Historical model preview</div>);

jest.mock('../../services/assetService', () => ({ assetService: { getVersions: jest.fn(), uploadVersion: jest.fn(), downloadVersion: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  assetService.getVersions.mockResolvedValue([]);
  assetService.uploadVersion.mockResolvedValue({ version: { id: 1, versionNumber: 1 }, asset: { id: 8 } });
});

test('replacement review preserves selection on cancel and sends only after confirmation', async () => {
  const user = userEvent.setup();
  const changed = jest.fn();
  render(<VersionHistory assetId="8" assetName="original.txt" assetInfo={{ filename: 'stored.txt' }} canCreate onCurrentVersionChanged={changed} />);
  await user.click(screen.getByRole('button', { name: 'Upload new version' }));
  const file = new File(['Replacement contents'], 'replacement.txt', { type: 'text/plain' });
  await user.upload(screen.getByLabelText('Replacement file'), file);
  await user.type(screen.getByLabelText('Version note'), 'Updated dialogue');
  await user.click(screen.getByRole('button', { name: 'Save version' }));
  expect(screen.getByRole('dialog', { name: 'Replace the current asset file?' })).toBeInTheDocument();
  expect(assetService.uploadVersion).not.toHaveBeenCalled();
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
  expect(screen.getByLabelText('Replacement file').files[0]).toBe(file);
  expect(screen.getByLabelText('Version note')).toHaveValue('Updated dialogue');
  await user.click(screen.getByRole('button', { name: 'Save version' }));
  await user.click(screen.getByRole('button', { name: 'Save new version' }));
  expect(assetService.uploadVersion).toHaveBeenCalledTimes(1);
  expect(assetService.uploadVersion).toHaveBeenCalledWith('8', file, 'Updated dialogue', expect.any(Function), expect.objectContaining({ reuseSource: false, expectedFilename: 'stored.txt' }));
  expect(changed).toHaveBeenCalledWith({ id: 8 });
});

test('switching version mode asks before discarding its note', async () => {
  const user = userEvent.setup();
  render(<VersionHistory assetId="8" assetName="original.txt" canCreate />);
  await user.click(screen.getByRole('button', { name: 'Preserve snapshot' }));
  await user.type(screen.getByLabelText('Version note'), 'Keep this note');
  await user.click(screen.getByRole('button', { name: 'Upload new version' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Version note')).toHaveValue('Keep this note');
  expect(screen.queryByLabelText('Replacement file')).not.toBeInTheDocument();
});

test.each([false, true])('history download is independent from version creation (%s)', async canDownload => {
  assetService.getVersions.mockResolvedValue([{ id: 4, versionNumber: 1, originalName: 'legacy.obj', createdBy: 9 }, { id: 5, versionNumber: 2, originalName: 'note.txt', createdBy: 9 }]);
  render(<VersionHistory assetId="8" assetName="model.obj" canCreate={false} canDownload={canDownload} />);
  await screen.findByText('legacy.obj');
  expect(screen.queryAllByRole('button', { name: 'Download', exact: true })).toHaveLength(canDownload ? 2 : 0);
  expect(screen.queryByRole('button', { name: 'Upload new version' })).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Preview', exact: true }));
  expect(await screen.findByText('Historical model preview')).toBeInTheDocument();
  expect(assetService.downloadVersion).not.toHaveBeenCalled();
});
