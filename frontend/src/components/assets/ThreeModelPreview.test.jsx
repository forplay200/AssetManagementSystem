import { render, screen } from '@testing-library/react';
import { TextDecoder } from 'util';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import ThreeModelPreview, { modelFormat, parseModelBuffer } from './ThreeModelPreview';
import { assetService } from '../../services/assetService';

jest.mock('../../services/assetService', () => ({ assetService: { getPreview: jest.fn() } }));

global.TextDecoder = global.TextDecoder || TextDecoder;

beforeEach(() => jest.clearAllMocks());

test('recognizes OBJ and FBX models independently of MIME type', () => {
  expect(modelFormat({ originalname: 'button.OBJ', mimetype: 'text/plain' })).toBe('obj');
  expect(modelFormat({ originalname: 'character.fbx', mimetype: 'application/octet-stream' })).toBe('fbx');
  expect(modelFormat({ originalname: 'texture.png', mimetype: 'image/png' })).toBe('');
});

test('parses OBJ geometry with the Three.js OBJ loader', () => {
  const source = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';
  const buffer = Uint8Array.from(source, (character) => character.charCodeAt(0)).buffer;
  const model = parseModelBuffer(buffer, 'obj');
  expect(model.getObjectByProperty('type', 'Mesh')).toBeTruthy();
});

test('routes FBX bytes through the Three.js FBX loader', () => {
  const parsed = new THREE.Group();
  const parse = jest.spyOn(FBXLoader.prototype, 'parse').mockReturnValue(parsed);
  const buffer = new ArrayBuffer(16);
  expect(parseModelBuffer(buffer, 'fbx')).toBe(parsed);
  expect(parse).toHaveBeenCalledWith(buffer, '');
  parse.mockRestore();
});

test('shows a loading indicator while protected model bytes are requested', () => {
  assetService.getPreview.mockReturnValue(new Promise(() => {}));
  render(<ThreeModelPreview assetId="12" info={{ originalname: 'model.fbx' }} />);
  expect(screen.getByText('Loading 3D model…')).toBeInTheDocument();
  expect(assetService.getPreview).toHaveBeenCalledWith('12');
});

test('shows a safe fallback when protected model loading fails', async () => {
  assetService.getPreview.mockRejectedValue(new Error('Network error'));
  render(<ThreeModelPreview assetId="13" info={{ originalname: 'broken.obj' }} />);
  expect(await screen.findByText('3D preview unavailable')).toBeInTheDocument();
  expect(screen.getByText(/still download the original asset/i)).toBeInTheDocument();
});
