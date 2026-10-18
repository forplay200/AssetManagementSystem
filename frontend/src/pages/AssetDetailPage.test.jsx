import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AssetDetailPage from './AssetDetailPage';
import { assetService } from '../services/assetService';

let mockUser;

jest.mock('../services/assetService', () => ({
  assetService: {
    rename: jest.fn(),
    getInfo: jest.fn(),
    getMetadata: jest.fn(),
    getTags: jest.fn(),
    getComments: jest.fn(),
    getVersions: jest.fn(),
    getVocabulary: jest.fn(),
    approveVocabularyEntry: jest.fn(),
    remove: jest.fn(),
  },
}));
jest.mock('../hooks/usePermissions', () => ({ usePermissions: () => ({ can: permission => require('../auth/permissions').hasPermission(mockUser.teamRole, permission) }) }));
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../components/assets/AssetPreview', () => () => <div>3D asset preview</div>);

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 7, accountRole: 'user', role: 'collaborator', teamRole: 'collaborator', team: { id: 8 } };
  assetService.getInfo.mockResolvedValue({ id: 42, workspaceId: 8, originalname: 'environment.fbx', mimetype: 'model/fbx', size: 2048, userId: 7 });
  assetService.getMetadata.mockResolvedValue({ metadata: { ai: { type: '3d', vertexCount: 30993, faceCount: 44358, modelTags: ['3d model', 'fbx', 'mid-poly', 'binary'], semanticTags: ['car', 'vehicle', 'transportation'] } } });
  assetService.getTags.mockResolvedValue({ tags: [] });
  assetService.getComments.mockResolvedValue({ comments: [], totalItems: 0 });
  assetService.getVersions.mockResolvedValue([]);
  assetService.getVocabulary.mockResolvedValue({ vocabulary: { entries: [] } });
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

const showPage = () => render(<MemoryRouter initialEntries={['/assets/42']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/assets/:assetId" element={<AssetDetailPage />} /><Route path="/assets" element={<div>Returned to library</div>} /></Routes></MemoryRouter>);

test.each([[7, true], [9, false]])('manager asset controls follow the uploader (%s)', async (id, writable) => {
  mockUser = { ...mockUser, id, role: 'workspaceManager', teamRole: 'workspaceManager' };
  const user = userEvent.setup(); showPage();
  await screen.findByText('Asset actions');
  for (const name of ['Rename asset', 'Edit metadata', 'Regenerate tags', 'Delete', 'Update materials / textures']) {
    expect(Boolean(screen.queryByRole('button', { name, exact: true }))).toBe(writable);
  }
  expect(screen.getByRole('button', { name: 'Refresh results' })).toBeEnabled();
  await user.click(screen.getByText('Visual vocabulary'));
  expect(await screen.findByRole('button', { name: 'Add to visual vocabulary' })).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'New repository tag' }) !== null).toBe(writable);
  await user.click(screen.getByRole('tab', { name: 'Versions' }));
  expect(Boolean(screen.queryByRole('button', { name: 'Preserve snapshot' }))).toBe(writable);
  expect(Boolean(screen.queryByRole('button', { name: 'Upload new version' }))).toBe(writable);
  await user.click(screen.getByRole('tab', { name: 'Comments' }));
  expect(await screen.findByRole('textbox', { name: 'Comment' })).toBeEnabled();
});

test('owner can edit another uploader asset; mismatched workspace never falls back to uploader', async () => {
  mockUser = { ...mockUser, id: 9, teamRole: 'workspaceOwner', role: 'workspaceOwner' };
  const view = showPage(); await screen.findByText('Asset actions');
  expect(screen.getByRole('button', { name: 'Delete', exact: true })).toBeInTheDocument();
  view.unmount(); mockUser = { ...mockUser, id: 7, team: { id: 9 } };
  showPage(); await screen.findByText('Asset actions');
  expect(screen.queryByRole('button', { name: 'Delete', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Edit metadata' })).not.toBeInTheDocument();
});

test('manager deletion requires confirmation; cancel sends nothing and failure stays on the asset', async () => {
  mockUser = { ...mockUser, teamRole: 'workspaceManager', role: 'workspaceManager' };
  const user = userEvent.setup(); showPage();
  await user.click(await screen.findByRole('button', { name: 'Delete', exact: true }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
  expect(assetService.remove).not.toHaveBeenCalled();
  assetService.remove.mockRejectedValue({ response: { status: 403, data: { message: 'Only the uploader or a workspace owner can modify this asset.' } } });
  await user.click(screen.getByRole('button', { name: 'Delete', exact: true }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete asset' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Only the uploader');
  expect(screen.queryByText('Returned to library')).not.toBeInTheDocument();
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

test('asset rename immediately updates the title while preserving a comment draft and source filename', async () => {
  mockUser = { ...mockUser, teamRole: 'workspaceOwner', role: 'workspaceOwner' };
  assetService.rename.mockResolvedValue({ asset: { id: 42, displayName: 'New scene' } });
  const user = userEvent.setup(); showPage();
  await user.click(await screen.findByRole('tab', { name: 'Comments' }));
  await user.type(await screen.findByRole('textbox', { name: 'Comment' }), 'Keep my comment');
  await user.click(screen.getByRole('button', { name: 'Rename asset' }));
  await user.clear(screen.getByLabelText('Name')); await user.type(screen.getByLabelText('Name'), 'New scene');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('New scene');
  expect(screen.getByRole('textbox', { name: 'Comment' })).toHaveValue('Keep my comment');
  expect(assetService.rename).toHaveBeenCalledWith('42', 'New scene');
  expect(assetService.getInfo).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'Rename asset' }));
  expect(screen.getByText('Source file: environment.fbx')).toBeInTheDocument();
});
