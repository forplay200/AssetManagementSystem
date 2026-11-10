import { render, screen } from '@testing-library/react';
import VideoTechnicalInfo from './VideoTechnicalInfo';
test('WebM technical details show actual VP9 and Opus rather than MP4 defaults', () => {
  render(<VideoTechnicalInfo media={{ container: 'webm', videoCodec: 'vp9', profile: 'Profile 0', durationSeconds: 180, displayWidth: 1920, displayHeight: 1080, hasAudio: true, audioCodec: 'opus', audioChannels: 2 }} />);
  expect(screen.getByText('WEBM')).toBeInTheDocument();
  expect(screen.getByText('VP9 · Profile 0')).toBeInTheDocument();
  expect(screen.getByText('OPUS · 2 channels')).toBeInTheDocument();
  expect(screen.queryByText(/AAC-LC|H\.264/)).not.toBeInTheDocument();
});
