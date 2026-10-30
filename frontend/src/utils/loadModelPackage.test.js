import { TextDecoder, TextEncoder } from 'util';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as THREE from 'three';
import { assetService } from '../services/assetService';
import { loadModelPackage } from './loadModelPackage';

jest.mock('../services/assetService', () => ({ assetService: { getPackage: jest.fn(), getPreview: jest.fn(), getVersionPreview: jest.fn(), downloadVersion: jest.fn() } }));
global.TextDecoder = global.TextDecoder || TextDecoder;
function fileBytes(text) { const bytes = new TextEncoder().encode(text); return { arrayBuffer: async () => bytes.buffer }; }
beforeEach(() => jest.clearAllMocks());

test.each(['obj', 'fbx'])('legacy historical %s models use the view-protected preview service', async format => {
  const text = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';
  assetService.getPackage.mockResolvedValue(null); assetService.getVersionPreview.mockResolvedValue(fileBytes(format === 'fbx' ? 'FBXHeaderExtension: {\nFBXVersion: 7400\n}\n' : text));
  const model = new THREE.Group(); model.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  const parse = jest.spyOn(FBXLoader.prototype, 'parse').mockReturnValue(model);
  try {
    const loaded = await loadModelPackage({ assetId: '8', versionId: 4, info: { originalname: `legacy.${format}` } });
    expect(assetService.getVersionPreview).toHaveBeenCalledWith('8', 4);
    expect(assetService.downloadVersion).not.toHaveBeenCalled(); expect(assetService.getPreview).not.toHaveBeenCalled();
    expect(loaded.model.getObjectByProperty('type', 'Mesh')).toBeTruthy(); loaded.dispose();
  } finally { parse.mockRestore(); }
});
