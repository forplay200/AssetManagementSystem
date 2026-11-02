import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VideoPreview from './VideoPreview';
import { assetService } from '../../services/assetService';
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { team: { id: 8 } } }) }));
jest.mock('../../services/assetService', () => ({ assetService: { getPreview: jest.fn(), getVersionPreview: jest.fn() } }));
beforeEach(() => {
  jest.clearAllMocks(); URL.createObjectURL = jest.fn(() => 'blob:video'); URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
test('video uses protected preview, stable file identity, inline playback and no collaborator download item', async () => {
  assetService.getPreview.mockResolvedValue(new Blob(['video']));
  const view = render(<VideoPreview assetId="7" sourceFilename="a.mp4" />);
  await waitFor(() => expect(screen.getByLabelText('Video preview')).toHaveAttribute('src', 'blob:video'));
  expect(screen.getByLabelText('Video preview')).toHaveAttribute('controlslist', 'nodownload');
  expect(screen.getByLabelText('Video preview')).toHaveAttribute('playsinline');
  view.rerender(<VideoPreview assetId="7" sourceFilename="a.mp4" canDownload />);
  expect(assetService.getPreview).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Video preview')).not.toHaveAttribute('controlslist');
  view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video');
});
test('history uses its own preview endpoint and cancels obsolete requests before creating an object URL', async () => {
  let finish;
  assetService.getVersionPreview.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<VideoPreview assetId="7" sourceFilename="old.mp4" versionId={4} />);
  const signal = assetService.getVersionPreview.mock.calls[0][2];
  expect(assetService.getPreview).not.toHaveBeenCalled(); view.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => finish(new Blob(['old']))); expect(URL.createObjectURL).not.toHaveBeenCalled();
});
test('preview failure offers a retry', async () => {
  assetService.getPreview.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(new Blob(['video']));
  render(<VideoPreview assetId="7" sourceFilename="a.mp4" />);
  await userEvent.click(await screen.findByRole('button', { name: 'Retry preview' }));
  await waitFor(() => expect(screen.getByLabelText('Video preview')).toHaveAttribute('src', 'blob:video'));
});
