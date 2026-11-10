import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VersionHistory from './VersionHistory';
import { assetService } from '../../services/assetService';

jest.mock('../assets/ThreeModelPreview', () => () => <div>Historical model preview</div>);
jest.mock('../assets/VideoPreview', () => props => <div>Historical video {props.versionId}</div>);

jest.mock('../../services/assetService', () => ({ assetService: { getVersions: jest.fn(), getVersionPreview: jest.fn(), uploadVersion: jest.fn(), downloadVersion: jest.fn() } }));

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
test('collaborator can preview a WebM history entry without a download action', async () => {
  assetService.getVersions.mockResolvedValue([{ id: 17, versionNumber: 1, originalName: 'scene.webm', mimeType: 'video/webm', fileName: 'immutable.webm', metadata: { media: { type: 'video', container: 'webm', durationSeconds: 180 } } }]);
  render(<VersionHistory assetId="8" assetInfo={{}} canCreate={false} canDownload={false} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Preview', exact: true }));
  expect(await screen.findByText('Historical video 17')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Download', exact: true })).not.toBeInTheDocument();
});
test('a viewing-only member can open and close the protected image for a historical snapshot', async () => {
  const user = userEvent.setup();
  const image = new Blob(['snapshot'], { type: 'image/png' });
  const createUrl = jest.fn(() => 'blob:historical-preview');
  const revokeUrl = jest.fn();
  const originalCreateUrl = URL.createObjectURL;
  const originalRevokeUrl = URL.revokeObjectURL;
  URL.createObjectURL = createUrl;
  URL.revokeObjectURL = revokeUrl;
  assetService.getVersionPreview.mockResolvedValue(image);
  assetService.getVersions.mockResolvedValue([{ id: 17, versionNumber: 1, originalName: 'past.png', mimeType: 'image/png' }]);
  try {
    render(<VersionHistory assetId="8" assetName="current.png" assetInfo={{}} />);
    await user.click(await screen.findByRole('button', { name: 'Preview', exact: true }));
    expect(await screen.findByRole('img', { name: 'Preview of past.png' })).toHaveAttribute('src', 'blob:historical-preview');
    expect(assetService.getVersionPreview).toHaveBeenCalledWith('8', 17, expect.any(AbortSignal));
    expect(createUrl).toHaveBeenCalledWith(image);
    expect(screen.queryByRole('button', { name: 'Download', exact: true })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide preview' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(revokeUrl).toHaveBeenCalledWith('blob:historical-preview');
  } finally {
    URL.createObjectURL = originalCreateUrl;
    URL.revokeObjectURL = originalRevokeUrl;
  }
});
test('shows the active file and labels the newest snapshot with separate people and times', async () => {
  const submittedAt = new Date(2026, 10, 9, 10, 30, 45).toISOString();
  const createdAt = new Date(2026, 10, 9, 10, 30, 46).toISOString();
  assetService.getVersions.mockResolvedValue([
    { id: 16, versionNumber: 1, originalName: 'older.png' },
    { id: 17, versionNumber: 2, originalName: 'past.png', submittedByName: 'maya', createdByName: 'alex', submittedAt, createdAt }
  ]);
  render(<VersionHistory assetId="8" assetName="current.png" assetInfo={{ fileSubmittedByName: 'jo' }} />);
  expect(screen.getByRole('heading', { name: 'Current file In use' })).toBeInTheDocument();
  expect(screen.getByText('jo')).toBeInTheDocument();
  const [latest, older] = await screen.findAllByRole('article');
  expect(within(latest).getByText('Most recent snapshot')).toBeInTheDocument();
  expect(within(older).queryByText('Most recent snapshot')).not.toBeInTheDocument();
  expect(within(latest).getByText('File submitted by', { exact: false })).toHaveTextContent('File submitted by maya');
  expect(within(latest).getByText('Snapshot saved by', { exact: false })).toHaveTextContent('Snapshot saved by alex');
  expect(within(latest).getByText(/10:30:45 AM/)).toHaveAttribute('datetime', submittedAt);
  expect(within(latest).getByText(/10:30:46 AM/)).toHaveAttribute('datetime', createdAt);
});
test('version replacement accepts a 100 MiB WebM and rejects a larger file before submission', async () => {
  render(<VersionHistory assetId="8" assetName="scene.mp4" canCreate />);
  const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: 'Upload new version' }));
  const input = screen.getByLabelText('Replacement file'); expect(input.accept).toContain('.webm');
  const edge = new File(['virtual-size fixture'], 'edge.webm'); Object.defineProperty(edge, 'size', { value: 100 * 1048576 });
  await user.upload(input, edge); expect(input.files[0]).toBe(edge);
  await user.type(screen.getByLabelText('Version note'), 'WebM boundary test');
  expect(screen.getByRole('button', { name: 'Save version' })).toBeEnabled();
  const over = new File(['virtual-size fixture'], 'over.webm'); Object.defineProperty(over, 'size', { value: 100 * 1048576 + 1 });
  await user.upload(input, over); expect(screen.getByText(/Video files allow up to 100 MiB/)).toBeInTheDocument();
  expect(assetService.uploadVersion).not.toHaveBeenCalled();
});
