import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VideoSuggestions from './VideoSuggestions';
import { assetService } from '../../services/assetService';
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { team: { id: 8 } } }) }));
jest.mock('../../services/assetService', () => ({ assetService: { getVideoJob: jest.fn(), reviewVideo: jest.fn(), generateAiTags: jest.fn(), getVideoFrame: jest.fn() } }));
const fixture = () => ({ id: 'job', status: 'succeeded', frames: [{ id: 'f0', timeSeconds: 1.2 }], candidates: [{ id: 'c0', name: 'bird', maxScore: 0.3, hitFrameCount: 1, sampleCount: 2, frameIds: ['f0'], decision: 'pending' }] });
beforeEach(() => { jest.clearAllMocks(); assetService.getVideoJob.mockResolvedValue({ job: fixture() }); assetService.getVideoFrame.mockResolvedValue(new Blob(['image'])); URL.createObjectURL = jest.fn(() => 'blob:frame'); URL.revokeObjectURL = jest.fn(); });
test('viewers can read candidates and their evidence without review or regenerate controls', async () => {
  render(<VideoSuggestions assetId="7" sourceFilename="a.mp4" canEdit={false} />);
  expect(await screen.findByText('bird')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Regenerate/ })).not.toBeInTheDocument();
  expect(await screen.findByAltText('Evidence at 1.20 seconds')).toBeInTheDocument();
});
test('accept uses the dedicated review endpoint and updates confirmed tags', async () => {
  const onMetadataChange = jest.fn(), onTagsChange = jest.fn();
  const job = fixture(); job.candidates[0].decision = 'accepted';
  assetService.reviewVideo.mockResolvedValue({ job, metadata: { ai: { videoTags: ['bird'] } }, tags: [{ id: 4, name: 'bird' }] });
  render(<VideoSuggestions assetId="7" sourceFilename="a.mp4" canEdit onMetadataChange={onMetadataChange} onTagsChange={onTagsChange} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Accept' }));
  await waitFor(() => expect(assetService.reviewVideo).toHaveBeenCalledWith('7', 'job', [{ candidateId: 'c0', decision: 'accepted' }]));
  expect(onTagsChange).toHaveBeenCalledWith([{ id: 4, name: 'bird' }]);
  expect(onMetadataChange).toHaveBeenCalledWith({ ai: { videoTags: ['bird'] } });
});
