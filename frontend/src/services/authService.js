import api from './api';

export function normalizeAuthResponse(data) {
  const token = data?.token || data?.accessToken;
  if (!token) throw new Error('Authentication response did not include a JWT token.');
  return { ...data, token };
}

export const authService = {
  async register(account) {
    const { data } = await api.post('/auth/register', account);
    return normalizeAuthResponse(data);
  },
  async login(credentials) {
    const { data } = await api.post('/auth/login', credentials);
    return normalizeAuthResponse(data);
  },
  async forgotPassword(email) {
    const { data } = await api.post('/auth/forgot-password', { email });
    return data;
  },
  async resetPassword(token, password) {
    const { data } = await api.post('/auth/reset-password', { token, password });
    return data;
  },
  async logout() {
    const { data } = await api.post('/auth/logout');
    return data;
  },
};
