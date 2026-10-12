import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MetadataPanel from './MetadataPanel';
import { assetService } from '../../services/assetService';

jest.mock('../../services/assetService', () => ({ assetService: { updateMetadata: jest.fn(), getMetadata: jest.fn() } }));
beforeEach(() => jest.clearAllMocks());

test('displays generated YAMNet audio tags without changing existing AI fields', () => {
  render(
    <MetadataPanel
      assetId="8"
      metadata={{ ai: { type: 'audio', transcript: 'Hello team', keywords: ['interface'], summary: 'A spoken update', audioTags: ['speech', 'music'] } }}
      repositoryTags={[]}
      canEdit={false}
      onMetadataChange={() => {}}
      onTagsChange={() => {}}
    />,
  );

  expect(screen.getByText('Generated audio tags')).toBeInTheDocument();
  expect(screen.getByText('speech')).toBeInTheDocument();
  expect(screen.getByText('music')).toBeInTheDocument();
  expect(screen.getByText('Hello team')).toBeInTheDocument();
});

test('removing existing fields requires confirmation and preserves other metadata', async () => {
  const user = userEvent.setup();
  const metadata = { description: 'Original', count: 3, enabled: true, nested: { keep: true }, ai: { type: 'audio', transcript: 'Keep original transcript' } };
  const changed = jest.fn();
  assetService.updateMetadata.mockImplementation(async (id, next) => ({ metadata: next }));
  render(<MetadataPanel assetId="8" metadata={metadata} repositoryTags={[]} canEdit onMetadataChange={changed} onTagsChange={() => {}} />);
  await user.click(screen.getByRole('button', { name: 'Edit metadata' }));
  expect(screen.getByRole('button', { name: 'Refresh results' })).toBeDisabled();
  await user.click(screen.getAllByRole('button', { name: 'Remove metadata field' })[0]);
  await user.click(screen.getByRole('button', { name: 'Save metadata' }));
  expect(assetService.updateMetadata).not.toHaveBeenCalled();
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
  expect(screen.getAllByRole('textbox', { name: 'Metadata field name' })).toHaveLength(2);
  await user.click(screen.getByRole('button', { name: 'Save metadata' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));
  expect(assetService.updateMetadata).toHaveBeenCalledWith('8', { count: 3, enabled: true, nested: { keep: true }, ai: metadata.ai });
  expect(changed).toHaveBeenCalledTimes(1);
});

test('displays extracted 3D geometry and model tags', () => {
  render(
    <MetadataPanel
      assetId="9"
      metadata={{ ai: { type: '3d', vertexCount: 1250, faceCount: 800, modelTags: ['3d model', 'low-poly'], semanticTags: ['car', 'vehicle'] } }}
      repositoryTags={[]}
      canEdit={false}
      onMetadataChange={() => {}}
      onTagsChange={() => {}}
    />,
  );

  expect(screen.getByText('Generated Model Tags')).toBeInTheDocument();
  expect(screen.getByText('low-poly')).toBeInTheDocument();
  expect(screen.getByText('3D Metadata')).toBeInTheDocument();
  expect(screen.getByText('Vertex Count')).toBeInTheDocument();
  expect(screen.getByText('Face Count')).toBeInTheDocument();
  expect(screen.getByText('1,250')).toBeInTheDocument();
  expect(screen.getByText('800')).toBeInTheDocument();
  expect(screen.getByText('CLIP Semantic Tags')).toBeInTheDocument();
  expect(screen.getByText('car')).toBeInTheDocument();
  expect(screen.getByText('vehicle')).toBeInTheDocument();
});
