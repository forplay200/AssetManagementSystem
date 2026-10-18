import { getAssetDisplayName } from './assetDisplayName';
test('display names fall back independently of source filenames', () => {
  const asset = { displayName: '主角 🐧', originalname: 'hero.fbx', filename: 'storage-key' };
  expect(getAssetDisplayName(asset)).toBe('主角 🐧'); expect(asset.originalname).toBe('hero.fbx');
  expect(getAssetDisplayName({ ...asset, displayName: null })).toBe('hero.fbx');
  expect(getAssetDisplayName({ filename: 'storage-key' })).toBe('storage-key');
  expect(getAssetDisplayName(null)).toBe('Unnamed asset');
});
