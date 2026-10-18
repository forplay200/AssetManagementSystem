// Presentation only: loaders, downloads and versions must retain source names.
export const getAssetDisplayName = asset => asset?.displayName || asset?.originalname || asset?.filename || 'Unnamed asset';
