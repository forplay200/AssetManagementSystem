import api from './api';
export const auditService = {
  async workspace(params) { return (await api.get('/teams/current/audit-events', { params })).data; },
  async asset(assetId, params) { return (await api.get(`/assets/${assetId}/audit-events`, { params })).data; },
};
