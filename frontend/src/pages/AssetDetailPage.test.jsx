import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AssetDetailPage from './AssetDetailPage';
import { assetService } from '../services/assetService';

jest.mock('../services/assetService', () => ({
  assetService: {
    getInfo: jest.fn(),
    getMetadata: jest.fn(),
    getTags: jest.fn(),
    getComments: jest.fn(),
    getVersions: jest.fn(),
  },
}));
jest.mock('../hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => false }) }));
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, role: 'user' } }) }));
jest.mock('../components/assets/AssetPreview', () => () => <div>3D asset preview</div>);

beforeEach(() => {
  jest.clearAllMocks();
  assetService.getInfo.mockResolvedValue({ id: 42, originalname: 'environment.fbx', mimetype: 'model/fbx', size: 2048, userId: 7 });
  assetService.getMetadata.mockResolvedValue({ metadata: { ai: { type: '3d', vertexCount: 30993, faceCount: 44358, modelTags: ['3d model', 'fbx', 'mid-poly', 'binary'], semanticTags: ['car', 'vehicle', 'transportation'] } } });
  assetService.getTags.mockResolvedValue({ tags: [] });
  assetService.getComments.mockResolvedValue({ comments: [], totalItems: 0 });
  assetService.getVersions.mockResolvedValue([]);
});

test('comment drafts survive switching between detail panels', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/assets/42']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/assets/:assetId" element={<AssetDetailPage />} /></Routes></MemoryRouter>);
  await user.click(await screen.findByRole('tab', { name: 'Comments' }));
  await user.type(await screen.findByRole('textbox', { name: 'Comment' }), 'A draft worth keeping');
  await user.click(screen.getByRole('tab', { name: 'Versions' }));
  expect(screen.queryByRole('textbox', { name: 'Comment' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: 'Details' }));
  await user.click(screen.getByRole('tab', { name: 'Comments' }));
  expect(screen.getByRole('textbox', { name: 'Comment' })).toHaveValue('A draft worth keeping');
  expect(assetService.getComments).toHaveBeenCalledTimes(1);
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
