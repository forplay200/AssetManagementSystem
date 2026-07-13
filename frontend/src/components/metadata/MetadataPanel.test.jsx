import { render, screen } from '@testing-library/react';
import MetadataPanel from './MetadataPanel';

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
