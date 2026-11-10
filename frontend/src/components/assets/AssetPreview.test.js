import { render, screen } from '@testing-library/react';
import { assetService } from '../../services/assetService';
import AssetPreview, { previewKind } from './AssetPreview';

test('classifies every browser-previewable asset group', () => {
  expect(previewKind({ mimetype: 'image/png', originalname: 'hero.png' })).toBe('image');
  expect(previewKind({ mimetype: 'video/webm', originalname: 'scene.webm' })).toBe('video');
  expect(previewKind({ mimetype: 'video/mp4', originalname: 'scene.mp4' })).toBe('video');
  expect(previewKind({ mimetype: 'audio/wav', originalname: 'theme.wav' })).toBe('audio');
  expect(previewKind({ mimetype: 'application/json', originalname: 'config.json' })).toBe('text');
  expect(previewKind({ mimetype: 'application/octet-stream', originalname: 'model.obj' })).toBe('model');
  expect(previewKind({ mimetype: 'application/octet-stream', originalname: 'model.fbx' })).toBe('model');
});

jest.mock('../../services/assetService', () => ({ assetService: { getPreview: jest.fn() } }));

test.each([false, true])('audio playback remains available with download capability=%s', async canDownload => {
  URL.createObjectURL = jest.fn(() => 'blob:audio-preview'); URL.revokeObjectURL = jest.fn();
  assetService.getPreview.mockResolvedValue(new Blob(['audio'], { type: 'audio/wav' }));
  render(<AssetPreview assetId="8" info={{ originalname: 'audio.wav', mimetype: 'audio/wav' }} canDownload={canDownload} />);
  const audio = await screen.findByLabelText('Audio preview');
  expect(audio).toHaveAttribute('controls'); expect(audio).toHaveAttribute('src', 'blob:audio-preview');
  expect(audio.getAttribute('controlslist')).toBe(canDownload ? null : 'nodownload');
});
test('audited audio saving uses the application download action while playback remains available', async () => {
  URL.createObjectURL = jest.fn(() => 'blob:audio-preview'); URL.revokeObjectURL = jest.fn();
  assetService.getPreview.mockResolvedValue(new Blob(['audio'], { type: 'audio/wav' }));
  render(<AssetPreview assetId="8" info={{ originalname: 'audio.wav', mimetype: 'audio/wav' }} canDownload auditDownloads />);
  const audio = await screen.findByLabelText('Audio preview'); expect(audio).toHaveAttribute('controls'); expect(audio).toHaveAttribute('controlslist', 'nodownload');
});
