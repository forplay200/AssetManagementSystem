import api from './api';

export const userService = {
  async list(params = {}) {
    const { data } = await api.get('/users', { params });
    return data;
  },
  async get(userId) {
    const { data } = await api.get(`/users/${userId}`);
    return data;
  },
  async setStatus(userId, status) {
    const { data } = await api.patch(`/users/${userId}/status`, { status });
    return data;
  },
};
