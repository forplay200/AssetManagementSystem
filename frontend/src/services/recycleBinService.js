import api from './api';
export const recycleBinService = {
  async list(params) { return (await api.get('/teams/current/recycle-bin', { params })).data; },
  async restore(assetId, cycleId, objection = false) { return (await api.post(`/assets/${assetId}/${objection ? 'object-and-restore' : 'restore'}`, { cycleId })).data; },
  async notifications(page = 1) { return (await api.get('/notifications', { params: { page } })).data; },
  async markRead(id) { return (await api.patch(`/notifications/${id}/read`)).data; },
};
