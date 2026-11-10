import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AssetDetailPage from './AssetDetailPage';
import { assetService, saveDownload } from '../services/assetService';
import { clearEditContext } from '../services/assetEditContext';
import { auditService } from '../services/auditService';
jest.mock('../services/auditService', () => ({ auditService: { asset: jest.fn(), workspace: jest.fn() } }));

let mockUser;

jest.mock('../services/assetService', () => ({
  saveDownload: jest.fn(),
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
    download: jest.fn(),
    editStatus: jest.fn(), startEditing: jest.fn(), endEditing: jest.fn(), addTag: jest.fn(), updateAiSuggestion: jest.fn(),
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
  assetService.editStatus.mockResolvedValue({ locked: false, revision: 0 });
  assetService.download.mockResolvedValue({ blob: new Blob(), filename: 'asset' });
  auditService.asset.mockResolvedValue({ events: [], nextCursor: null });
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

test('Activity opens as a drawer and preserves the selected Comments tab and draft when closed', async () => {
  const user = userEvent.setup();
  assetService.getInfo.mockResolvedValue({ id: 42, workspaceId: 8, governanceEnabled: true, originalname: 'environment.fbx', mimetype: 'model/fbx', size: 2048, userId: 7 });
  render(<MemoryRouter initialEntries={['/assets/42']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/assets/:assetId" element={<AssetDetailPage />} /></Routes></MemoryRouter>);
  await user.click(await screen.findByRole('tab', { name: 'Comments' }));
  await user.type(await screen.findByRole('textbox', { name: 'Comment' }), 'Keep this draft');
  expect(screen.getAllByRole('tab')).toHaveLength(3);
  const activity = screen.getByRole('button', { name: 'Activity', exact: true }); await user.click(activity);
  expect(await screen.findByRole('dialog', { name: 'Asset activity' })).toBeInTheDocument();
  await waitFor(() => expect(auditService.asset).toHaveBeenCalledWith('42', {}));
  await user.keyboard('{Escape}');
  expect(screen.getAllByRole('tab')).toHaveLength(3); expect(screen.getByRole('tab', { name: 'Comments' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('textbox', { name: 'Comment' })).toHaveValue('Keep this draft'); expect(activity).toHaveFocus();
  expect(assetService.startEditing).not.toHaveBeenCalled();
});

const showPage = () => render(<MemoryRouter initialEntries={['/assets/42']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/assets/:assetId" element={<AssetDetailPage />} /><Route path="/assets" element={<div>Returned to library</div>} /></Routes></MemoryRouter>);

test('the sole recycle action is an icon that opens confirmation and returns to the library after approval', async () => {
  const user = userEvent.setup();
  mockUser = { ...mockUser, role: 'workspaceOwner', teamRole: 'workspaceOwner' };
  assetService.getInfo.mockResolvedValue({ id: 42, workspaceId: 8, governanceEnabled: true, originalname: 'hero.png', mimetype: 'image/png', size: 100, userId: 7 });
  assetService.remove.mockResolvedValue({});
  showPage();
  const recycle = await screen.findByRole('button', { name: 'Move to recycle bin' });
  expect(recycle).toHaveTextContent(/^$/);
  expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  await user.click(recycle);
  const dialog = await screen.findByRole('dialog', { name: 'Move to recycle bin?' });
  await user.click(within(dialog).getByRole('button', { name: 'Move to recycle bin' }));
  expect(await screen.findByText('Returned to library')).toBeInTheDocument();
});

test('audio transcript and tag suggestions appear when processing finishes even while another member holds the edit lock', async () => {
  jest.useFakeTimers();
  try {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const asset = { id: 42, workspaceId: 8, governanceEnabled: true, originalname: 'update.wav', mimetype: 'audio/wav', size: 2048, userId: 7 };
    assetService.getInfo.mockResolvedValueOnce({ ...asset, aiProcessing: true })
      .mockResolvedValue({ ...asset, aiProcessing: false, pendingAiResult: { stale: false, tags: ['speech'], transcript: 'A new audio update.' } });
    assetService.getMetadata.mockResolvedValue({ metadata: {} });
    assetService.editStatus.mockResolvedValue({ locked: true, holderName: 'Alice' });
    showPage();
    await screen.findByText('Generating AI results…');
    await act(async () => { jest.advanceTimersByTime(3000); });
    expect(screen.getByText('Alice is editing this asset.')).toBeInTheDocument();
    const suggestions = within(screen.getByLabelText('AI tag suggestions'));
    expect(suggestions.getByText('speech')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View audio AI results' }));
    const results = screen.getByRole('region', { name: 'AI enrichment' });
    expect(results).toHaveFocus();
    expect(within(results).getByText('A new audio update.')).toBeInTheDocument();
    expect(assetService.startEditing).not.toHaveBeenCalled();
    expect(assetService.getMetadata).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

test('each AI suggestion has its own accept action and there is no bulk apply button', async () => {
  const user = userEvent.setup();
  mockUser = { ...mockUser, role: 'workspaceManager', teamRole: 'workspaceManager' };
  const createdAt = '2026-11-09T04:00:00.000Z';
  let pending = ['shield', 'texture'];
  let repository = [];
  assetService.getInfo.mockImplementation(async () => ({ id: 42, workspaceId: 8, governanceEnabled: true, originalname: 'hero.png', mimetype: 'image/png', size: 2048, userId: 7, pendingAiResult: { stale: false, createdAt, tags: pending } }));
  assetService.getTags.mockImplementation(async () => ({ tags: repository }));
  assetService.getMetadata.mockResolvedValue({ metadata: {} });
  assetService.startEditing.mockImplementation(async () => {
    assetService.editStatus.mockResolvedValue({ locked: true, sessionId: 'tag-edit' });
    return { sessionId: 'tag-edit', token: 'tag-token', revision: 0 };
  });
  assetService.addTag.mockImplementation(async () => {
    pending = ['texture'];
    const tag = { id: 3, name: 'shield' };
    repository = [tag];
    return { tag };
  });
  assetService.updateAiSuggestion.mockImplementation(async () => { pending = []; });
  showPage();
  await user.click(await screen.findByRole('button', { name: 'Start editing', exact: true }));
  const suggestions = within(await screen.findByLabelText('AI tag suggestions'));
  await user.click(await suggestions.findByRole('button', { name: 'Accept shield as repository tag' }));
  expect(assetService.addTag).toHaveBeenCalledTimes(1);
  expect(assetService.addTag).toHaveBeenCalledWith('42', 'shield', createdAt);
  expect(suggestions.queryByText('shield')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove repository tag shield' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Cancel editing' })).toBeEnabled();
  expect(suggestions.getByRole('button', { name: 'Accept texture as repository tag' })).toBeInTheDocument();
  await user.click(suggestions.getByRole('button', { name: 'Remove texture' }));
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove tag' }));
  expect(assetService.updateAiSuggestion).toHaveBeenCalledWith('42', 'texture', createdAt, null);
  expect(await suggestions.findByText('No AI tag suggestions to review.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel editing' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: /apply generated/i })).not.toBeInTheDocument();
  await act(async () => { clearEditContext('42', 'tag-token'); });
});

test.each([[7, true], [9, false]])('manager asset controls follow the uploader (%s)', async (id, writable) => {
  mockUser = { ...mockUser, id, role: 'workspaceManager', teamRole: 'workspaceManager' };
  const user = userEvent.setup(); showPage();
  await screen.findByRole('heading', { level: 1 });
  const more = screen.queryByRole('button', { name: 'More actions' });
  expect(Boolean(more)).toBe(writable);
  if (more) await user.click(more);
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
  const user = userEvent.setup();
  const view = showPage();
  await user.click(await screen.findByRole('button', { name: 'More actions' }));
  expect(screen.getByRole('button', { name: 'Delete', exact: true })).toBeInTheDocument();
  view.unmount(); mockUser = { ...mockUser, id: 7, team: { id: 9 } };
  showPage(); await screen.findByRole('heading', { level: 1 });
  expect(screen.queryByRole('button', { name: 'Delete', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Edit metadata' })).not.toBeInTheDocument();
});

test('manager deletion requires confirmation; cancel sends nothing and failure stays on the asset', async () => {
  mockUser = { ...mockUser, teamRole: 'workspaceManager', role: 'workspaceManager' };
  const user = userEvent.setup(); showPage();
  await user.click(await screen.findByRole('button', { name: 'More actions' }));
  await user.click(await screen.findByRole('button', { name: 'Delete', exact: true }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
  expect(assetService.remove).not.toHaveBeenCalled();
  assetService.remove.mockRejectedValue({ response: { status: 403, data: { message: 'Only the uploader or a workspace owner can modify this asset.' } } });
  await user.click(screen.getByRole('button', { name: 'More actions' }));
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

test('rename is available before editing and cancellation releases the lease acquired for the dialog', async () => {
  const user = userEvent.setup();
  mockUser = { ...mockUser, teamRole: 'workspaceOwner', role: 'workspaceOwner' };
  const asset = { id: 42, workspaceId: 8, governanceEnabled: true, originalname: 'hero.png', mimetype: 'image/png', size: 100, userId: 7 };
  const session = { sessionId: 'rename-session', token: 'rename-token', revision: 1 };
  assetService.getInfo.mockResolvedValueOnce(asset).mockResolvedValue({ ...asset, displayName: 'Latest name' });
  assetService.startEditing.mockImplementation(async () => {
    assetService.editStatus.mockResolvedValue({ locked: true, sessionId: session.sessionId });
    return session;
  });
  assetService.endEditing.mockImplementation(async () => {
    assetService.editStatus.mockResolvedValue({ locked: false });
    return { released: true };
  });
  showPage();
  await user.click(await screen.findByRole('button', { name: 'Rename asset' }));
  const dialog = await screen.findByRole('dialog', { name: 'Rename asset' });
  expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Latest name');
  expect(assetService.startEditing).toHaveBeenCalledWith('42');
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(assetService.endEditing).toHaveBeenCalledWith('42', session);
  expect(assetService.rename).not.toHaveBeenCalled();
});

test('collaborator keeps preview, metadata, comments and history without download UI or empty actions', async () => {
  assetService.getInfo.mockResolvedValue({ id: 42, workspaceId: 8, originalname: 'model.obj', mimetype: 'model/obj', size: 100, userId: 9, package: { fileCount: 3 } });
  const user = userEvent.setup(); showPage(); await screen.findByRole('heading', { level: 1 });
  expect(screen.getByText('3D asset preview')).toBeInTheDocument();
  expect(screen.queryByText('Asset actions')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Download|Original main file/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/Download the complete model package/)).not.toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: 'Versions' }));
  expect(await screen.findByText('No preserved versions')).toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: 'Comments' }));
  expect(await screen.findByRole('textbox', { name: 'Comment' })).toBeEnabled();
});
test.each(['workspaceOwner', 'workspaceManager'])('%s can download another uploader package without write access being required', async role => {
  mockUser = { ...mockUser, teamRole: role, role };
  assetService.getInfo.mockResolvedValue({ id: 42, workspaceId: 8, originalname: 'model.obj', userId: 99, package: { fileCount: 3 } });
  const user = userEvent.setup();
  showPage();
  const trigger = await screen.findByRole('button', { name: 'Download', exact: true });
  expect(screen.getAllByRole('button', { name: /Download/ })).toHaveLength(1);
  await user.click(trigger);
  await user.click(screen.getByRole('button', { name: 'Download ZIP' }));
  await user.click(trigger);
  await user.click(screen.getByRole('button', { name: 'Original main file' }));
  expect(assetService.download.mock.calls).toEqual([
    ['42', { main: false, filename: 'model.obj' }],
    ['42', { main: true, filename: 'model.obj' }],
  ]);
  expect(saveDownload).toHaveBeenCalledTimes(2);
});

test('download and start editing acquires a lease before downloading', async () => {
  const user = userEvent.setup();
  mockUser = { ...mockUser, role: 'workspaceOwner', teamRole: 'workspaceOwner' };
  assetService.getInfo.mockResolvedValue({ id: 42, workspaceId: 8, governanceEnabled: true, originalname: 'hero.png', mimetype: 'image/png', size: 100, userId: 7 });
  const session = { sessionId: 'download-edit', token: 'download-token', revision: 0 };
  assetService.startEditing.mockRejectedValueOnce(new Error('Lock request failed')).mockImplementationOnce(async () => {
    assetService.editStatus.mockResolvedValue({ locked: true, sessionId: session.sessionId, revision: 0 });
    return session;
  });
  showPage();
  const trigger = await screen.findByRole('button', { name: 'Download', exact: true });
  await user.click(trigger);
  await user.tab();
  expect(screen.getByRole('button', { name: 'Download current file' })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await user.click(trigger);
  await user.click(screen.getByRole('button', { name: 'Download and start editing' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(assetService.download).not.toHaveBeenCalled();
  await user.click(trigger);
  await user.click(screen.getByRole('button', { name: 'Download and start editing' }));
  expect(await screen.findByRole('button', { name: 'Cancel editing' })).toBeEnabled();
  await waitFor(() => expect(assetService.download).toHaveBeenCalledWith('42', { main: false, filename: 'hero.png' }));
  expect(assetService.startEditing.mock.invocationCallOrder[1]).toBeLessThan(assetService.download.mock.invocationCallOrder[0]);
  await act(async () => { clearEditContext('42', session.token); });
});
