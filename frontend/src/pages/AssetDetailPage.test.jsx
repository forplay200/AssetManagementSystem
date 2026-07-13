import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AssetDetailPage from './AssetDetailPage';
import { assetService } from '../services/assetService';

jest.mock('../services/assetService', () => ({
  assetService: {
    getInfo: jest.fn(),
    getMetadata: jest.fn(),
    getTags: jest.fn(),
  },
}));
jest.mock('../hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => false }) }));
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, role: 'developer' } }) }));
jest.mock('../components/assets/AssetPreview', () => () => <div>3D asset preview</div>);

beforeEach(() => {
  jest.clearAllMocks();
  assetService.getInfo.mockResolvedValue({ id: 42, originalname: 'environment.fbx', mimetype: 'model/fbx', size: 2048, userId: 7 });
  assetService.getMetadata.mockResolvedValue({ metadata: { ai: { type: '3d', vertexCount: 30993, faceCount: 44358, modelTags: ['3d model', 'fbx', 'mid-poly', 'binary'], semanticTags: ['car', 'vehicle', 'transportation'] } } });
  assetService.getTags.mockResolvedValue({ tags: [] });
});

test('renders stored 3D AI metadata through the Asset Detail integration', async () => {
  render(
    <MemoryRouter initialEntries={['/assets/42']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="/assets/:assetId" element={<AssetDetailPage />} /></Routes>
    </MemoryRouter>,
  );

  expect(await screen.findByText('3D Metadata')).toBeInTheDocument();
  expect(screen.getByText('Vertex Count')).toBeInTheDocument();
  expect(screen.getByText('30,993')).toBeInTheDocument();
  expect(screen.getByText('Face Count')).toBeInTheDocument();
  expect(screen.getByText('44,358')).toBeInTheDocument();
  expect(screen.getByText('Generated Model Tags')).toBeInTheDocument();
  for (const tag of ['3d model', 'fbx', 'mid-poly', 'binary']) expect(screen.getByText(tag)).toBeInTheDocument();
  expect(screen.getByText('CLIP Semantic Tags')).toBeInTheDocument();
  for (const tag of ['car', 'vehicle', 'transportation']) expect(screen.getByText(tag)).toBeInTheDocument();

  await waitFor(() => expect(assetService.getMetadata).toHaveBeenCalledWith('42'));
});
