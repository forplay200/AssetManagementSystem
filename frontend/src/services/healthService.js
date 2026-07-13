import api from './api';

export const healthService = {
  async check() {
    try {
      const { data } = await api.get('/health', { timeout: 8000 });
      return data;
    } catch (error) {
      if (error.response?.data?.status) return error.response.data;
      throw error;
    }
  },
};
