export function compactMetadata(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]).filter(([, value]) => value !== '' && value !== null && value !== undefined));
}
