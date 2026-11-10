import api from './api';

const recyclePreviewPath = (assetId, cycleId) => `/assets/${assetId}/recycle-bin/${encodeURIComponent(cycleId)}`;

function appendModelPackage(formData, options = {}) {
  const paths = [];
  const indexes = { materials: 0, textures: 0 };
  for (const resource of options.attachments || []) {
    const field = resource.kind === 'material' ? 'materials' : 'textures';
    paths.push({ id: resource.id, path: resource.path, field, index: indexes[field]++ });
    formData.append(field, resource.file, resource.file.name);
  }
  formData.append('resourcePaths', JSON.stringify(paths));
  formData.append('bindings', JSON.stringify(options.bindings || {}));
  formData.append('geometryOnly', String(Boolean(options.geometryOnly)));
  if (options.reuseSource) formData.append('reuseSource', 'true');
  if (options.expectedFilename) formData.append('expectedFilename', options.expectedFilename);
}
function downloadResponse(response, fallback) {
  const disposition = response.headers['content-disposition'] || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plain = disposition.match(/filename="?([^";]+)"?/i);
  let filename = fallback;
  try { filename = encoded ? decodeURIComponent(encoded[1]) : plain?.[1] || fallback; } catch { /* Keep fallback. */ }
  return { blob: response.data, filename };
}
export function saveDownload({ blob, filename }) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename || 'asset'; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const assetService = {
  async editStatus(assetId) { return (await api.get(`/assets/${assetId}/edit-session`)).data; },
  async startEditing(assetId) { return (await api.post(`/assets/${assetId}/edit-session`)).data; },
  async renewEditing(assetId, session) { return (await api.post(`/assets/${assetId}/edit-session/heartbeat`, {}, { headers: { 'X-Asset-Edit-Token': session.token, 'X-Asset-Revision': String(session.revision) } })).data; },
  async endEditing(assetId, session) { return (await api.delete(`/assets/${assetId}/edit-session`, { headers: { 'X-Asset-Edit-Token': session.token } })).data; },
  async getVideoJob(assetId, signal) {
    const { data } = await api.get(`/assets/${assetId}/ai-jobs/current`, { signal }); return data;
  },
  async reviewVideo(assetId, jobId, decisions) {
    const { data } = await api.post(`/assets/${assetId}/ai-jobs/${jobId}/review`, { decisions }); return data;
  },
  async getVideoFrame(assetId, jobId, frameId, signal) {
    const { data } = await api.get(`/assets/${assetId}/ai-jobs/${jobId}/frames/${frameId}`, { responseType: 'blob', signal }); return data;
  },
  async rename(assetId, displayName) {
    const { data } = await api.patch(`/assets/${assetId}/name`, { displayName });
    return data;
  },
  async search(params = {}) {
    const { data } = await api.get('/assets/search', { params });
    return data;
  },
  async getInfo(assetId) {
    const { data } = await api.get(`/assets/${assetId}/details`);
    return data;
  },
  async getMetadata(assetId) {
    const { data } = await api.get(`/assets/${assetId}/metadata`);
    return data;
  },
  async updateMetadata(assetId, metadata) {
    const { data } = await api.put(`/assets/${assetId}/metadata`, { metadata });
    return data;
  },
  async getTags(assetId) {
    const { data } = await api.get(`/assets/${assetId}/tags`);
    return data;
  },
  async getVocabulary(assetId) {
    const { data } = await api.get(`/assets/${assetId}/vocabulary`);
    return data;
  },
  async approveVocabularyEntry(assetId, entry) {
    const { data } = await api.post(`/assets/${assetId}/vocabulary`, { ...entry, confirmed: true });
    return data;
  },
  async removeVocabularyEntry(assetId, entryId) {
    const { data } = await api.delete(`/assets/${assetId}/vocabulary/${entryId}`);
    return data;
  },
  async generateAiTags(assetId, regenerate = false) {
    const { data } = await api.post('/assets/ai/job', { assetId: Number(assetId), jobType: 'auto_tag', regenerate });
    return data;
  },
  async addTag(assetId, tag, suggestionCreatedAt) {
    const { data } = await api.post(`/assets/${assetId}/tags`, { tag, suggestionCreatedAt, keepEditing: true });
    return data;
  },
  async removeTag(assetId, tag) {
    const { data } = await api.delete(`/assets/${assetId}/tags`, { data: { tag, keepEditing: true } });
    return data;
  },
  async updateAiSuggestion(assetId, tag, suggestionCreatedAt, replacement) {
    const { data } = await api.patch(`/assets/${assetId}/ai-suggestions`, { tag, suggestionCreatedAt, replacement });
    return data;
  },
  async getPreview(assetId, signal, options = {}) {
    const path = options.recycleCycleId ? `${recyclePreviewPath(assetId, options.recycleCycleId)}/preview` : `/assets/preview/${assetId}`;
    const { data } = await api.get(path, { responseType: 'blob', timeout: options.video ? 300000 : 120000, signal, onDownloadProgress: options.onDownloadProgress });
    return data;
  },
  async getVersionPreview(assetId, versionId, signal, options = {}) {
    const { data } = await api.get(`/assets/${assetId}/versions/${versionId}/preview`, { responseType: 'blob', timeout: options.video ? 300000 : 120000, signal, onDownloadProgress: options.onDownloadProgress });
    return data;
  },
  async getPackage(assetId, versionId, recycleCycleId) {
    const prefix = recycleCycleId ? recyclePreviewPath(assetId, recycleCycleId) : versionId ? `/assets/${assetId}/versions/${versionId}` : `/assets/${assetId}`;
    const { data } = await api.get(`${prefix}/package`);
    return data.package;
  },
  async getResource(assetId, resourceId, { versionId, recycleCycleId, preview = false, packageId } = {}) {
    const prefix = recycleCycleId ? recyclePreviewPath(assetId, recycleCycleId) : versionId ? `/assets/${assetId}/versions/${versionId}` : `/assets/${assetId}`;
    const { data } = await api.get(`${prefix}/resources/${encodeURIComponent(resourceId)}`, { responseType: 'blob', timeout: 120000, params: { preview, packageId } });
    return data;
  },
  async download(assetId, { main = false, filename = 'asset' } = {}) {
    return downloadResponse(await api.get(`/assets/download/${assetId}`, { responseType: 'blob', timeout: 120000, params: { main } }), filename);
  },
  async upload(file, onUploadProgress, options = {}) {
    const formData = new FormData();
    formData.append('asset', file);
    formData.append('sourceName', file.name);
    appendModelPackage(formData, options);
    const { data } = await api.post('/assets/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
      timeout: /\.(mp4|webm)$/i.test(file.name) ? 300000 : 120000,
    });
    return data;
  },
  async remove(assetId, reason) {
    const { data } = await api.delete(`/assets/${assetId}`, reason === undefined ? undefined : { data: { reason } });
    return data;
  },
  async getVersions(assetId) {
    const { data } = await api.get(`/assets/${assetId}/versions`);
    return data;
  },
  async createVersion(assetId, changeLog) {
    const { data } = await api.post(`/assets/${assetId}/versions`, { changeLog });
    return data;
  },
  async uploadVersion(assetId, file, changeLog, onUploadProgress, options = {}) {
    const formData = new FormData();
    if (file && !options.reuseSource) formData.append('asset', file);
    if (file && !options.reuseSource) formData.append('sourceName', file.name);
    formData.append('changeLog', changeLog);
    appendModelPackage(formData, options);
    const { data } = await api.post(`/assets/${assetId}/versions/upload`, formData, {
      assetFileBaseVersion: options.baseContentVersionId,
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
      timeout: /\.(mp4|webm)$/i.test(file?.name || '') ? 300000 : 120000,
    });
    return data;
  },
  async downloadVersion(assetId, versionId, { main = false, filename = 'asset' } = {}) {
    return downloadResponse(await api.get(`/assets/${assetId}/versions/${versionId}/download`, { responseType: 'blob', timeout: 120000, params: { main } }), filename);
  },
  async getComments(assetId, params = {}) {
    const { data } = await api.get(`/assets/${assetId}/comments`, { params });
    return data;
  },
  async createComment(assetId, content, parentId = null) {
    const { data } = await api.post(`/assets/${assetId}/comments`, { content, parentId });
    return data;
  },
  async updateComment(commentId, content) {
    const { data } = await api.put(`/comments/${commentId}`, { content });
    return data;
  },
  async deleteComment(commentId) {
    const { data } = await api.delete(`/comments/${commentId}`);
    return data;
  },
  async getDashboardStats() {
    const { data } = await api.get('/assets/dashboard/stats');
    return data;
  },
};
