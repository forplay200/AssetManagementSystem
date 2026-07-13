import api from './api';

export const assetService = {
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
  async addTag(assetId, tag) {
    const { data } = await api.post(`/assets/${assetId}/tags`, { tag });
    return data;
  },
  async removeTag(assetId, tag) {
    const { data } = await api.delete(`/assets/${assetId}/tags`, { data: { tag } });
    return data;
  },
  async getPreview(assetId) {
    const { data } = await api.get(`/assets/preview/${assetId}`, { responseType: 'blob' });
    return data;
  },
  async download(assetId) {
    const { data } = await api.get(`/assets/download/${assetId}`, { responseType: 'blob' });
    return data;
  },
  async upload(file, onUploadProgress) {
    const formData = new FormData();
    formData.append('asset', file);
    const { data } = await api.post('/assets/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    });
    return data;
  },
  async remove(assetId) {
    const { data } = await api.delete(`/assets/${assetId}`);
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
  async uploadVersion(assetId, file, changeLog, onUploadProgress) {
    const formData = new FormData();
    formData.append('asset', file);
    formData.append('changeLog', changeLog);
    const { data } = await api.post(`/assets/${assetId}/versions/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    });
    return data;
  },
  async downloadVersion(assetId, versionId) {
    const { data } = await api.get(`/assets/${assetId}/versions/${versionId}/download`, { responseType: 'blob' });
    return data;
  },
  async getComments(assetId, params = {}) {
    const { data } = await api.get(`/assets/${assetId}/comments`, { params });
    return data;
  },
  async createComment(assetId, content, parentId = null) {
    const { data } = await api.post(`/assets/${assetId}/comments`, { content, parentId });
    return data;
  },
  async getDashboardStats() {
    const { data } = await api.get('/assets/dashboard/stats');
    return data;
  },
};
