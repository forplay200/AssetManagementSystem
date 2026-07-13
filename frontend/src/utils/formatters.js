export function formatBytes(bytes = 0) {
  if (!Number.isFinite(Number(bytes)) || Number(bytes) === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(Number(bytes)) / Math.log(1024)), units.length - 1);
  return `${(Number(bytes) / 1024 ** exponent).toFixed(exponent ? 1 : 0)} ${units[exponent]}`;
}

export function formatDate(value) {
  if (!value) return 'Unknown date';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
}

export function formatDateTime(value) {
  if (!value) return 'Unknown time';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function assetType(mime = '') {
  if (mime.startsWith('image/')) return 'Image';
  if (mime.startsWith('audio/')) return 'Audio';
  if (mime.includes('json') || mime.includes('xml')) return 'Data';
  if (mime.startsWith('text/')) return 'Script';
  if (mime.startsWith('model/')) return '3D Model';
  return 'Asset';
}
