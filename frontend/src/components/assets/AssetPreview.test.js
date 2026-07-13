import { previewKind } from './AssetPreview';

test('classifies every browser-previewable asset group', () => {
  expect(previewKind({ mimetype: 'image/png', originalname: 'hero.png' })).toBe('image');
  expect(previewKind({ mimetype: 'audio/wav', originalname: 'theme.wav' })).toBe('audio');
  expect(previewKind({ mimetype: 'application/json', originalname: 'config.json' })).toBe('text');
  expect(previewKind({ mimetype: 'application/octet-stream', originalname: 'model.obj' })).toBe('model');
  expect(previewKind({ mimetype: 'application/octet-stream', originalname: 'model.fbx' })).toBe('model');
});
