import { Box, FileAudio, FileCode2, FileJson, Image } from 'lucide-react';
import { assetType } from '../../utils/formatters';

const icons = { Image, Audio: FileAudio, Script: FileCode2, Data: FileJson, '3D Model': Box, Asset: Box };

export default function AssetTypeIcon({ mime, size = 28 }) {
  const type = assetType(mime);
  const Icon = icons[type];
  return <Icon size={size} strokeWidth={1.5} />;
}
