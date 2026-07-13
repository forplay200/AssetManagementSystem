import axios from 'axios';
import { clearStoredSession, readStoredSession } from '../auth/authStorage';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000/api',
  timeout: 15000,
});

export function setAuthorizationToken(token) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
}

setAuthorizationToken(readStoredSession()?.token);

api.interceptors.request.use((config) => {
  const token = readStoredSession()?.token;
  if (token) {
    const value = `Bearer ${token}`;
    if (typeof config.headers?.set === 'function') config.headers.set('Authorization', value);
    else config.headers = { ...(config.headers || {}), Authorization: value };
  } else if (typeof config.headers?.delete === 'function') {
    config.headers.delete('Authorization');
  } else if (config.headers) {
    delete config.headers.Authorization;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const hasSession = Boolean(readStoredSession()?.token);
    const invalidToken = error.response?.status === 400 && error.response?.data?.message === 'Invalid token.';
    const unauthorizedSession = error.response?.status === 401 && hasSession;
    if (invalidToken || unauthorizedSession) {
      clearStoredSession();
      setAuthorizationToken(null);
      window.dispatchEvent(new Event('aether:session-expired'));
      if (!window.location.pathname.startsWith('/login')) window.location.assign('/login?reason=session-expired');
    }
    return Promise.reject(error);
  },
);

export function getApiError(error, fallback = 'Something went wrong. Please try again.') {
  return error.response?.data?.message || (error.code === 'ECONNABORTED' ? 'The request timed out.' : fallback);
}

export default api;
