import { supportsImageThumbnail } from './AssetThumbnail';

test('only image MIME types request gallery thumbnails', () => {
  expect(supportsImageThumbnail('image/png')).toBe(true);
  expect(supportsImageThumbnail('image/gif')).toBe(true);
  expect(supportsImageThumbnail('audio/wav')).toBe(false);
  expect(supportsImageThumbnail('application/json')).toBe(false);
});
