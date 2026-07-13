import api from './api';

export const userService = {
  async list() {
    const { data } = await api.get('/users');
    return data;
  },
  async create(user) {
    const { data } = await api.post('/users', user);
    return data;
  },
  async update(userId, changes) {
    const { data } = await api.put(`/users/${userId}`, changes);
    return data;
  },
  async remove(userId) {
    const { data } = await api.delete(`/users/${userId}`);
    return data;
  },
};
