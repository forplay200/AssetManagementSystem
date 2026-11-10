import axios from 'axios';
import { clearStoredSession, readStoredSession } from '../auth/authStorage';
import { assetWriteId, getEditContext, clearEditContext, advanceEditContext } from './assetEditContext';

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
  const assetId = assetWriteId(config);
  const edit = assetId && getEditContext(assetId);
  if (edit) {
    config.headers = config.headers || {};
    for (const [name, value] of Object.entries({ 'X-Asset-Edit-Token': edit.token, 'X-Asset-Revision': String(edit.revision), 'X-Asset-Base-Version': config.assetFileBaseVersion || edit.baseContentVersionId })) {
      if (typeof config.headers.set === 'function') config.headers.set(name, value);
      else config.headers[name] = value;
    }
    config.assetEdit = { assetId, token: edit.token };
  }
  const storedSession = readStoredSession();
  const token = storedSession?.token;
  if (token) {
    const value = `Bearer ${token}`;
    if (typeof config.headers?.set === 'function') config.headers.set('Authorization', value);
    else config.headers = { ...(config.headers || {}), Authorization: value };
  } else if (typeof config.headers?.delete === 'function') {
    config.headers.delete('Authorization');
  } else if (config.headers) {
    delete config.headers.Authorization;
  }
  const teamId = storedSession?.user?.team?.id;
  if (teamId) {
    if (typeof config.headers?.set === 'function') {
      config.headers.set('X-Workspace-Id', String(teamId));
      config.headers.set('X-Team-Id', String(teamId));
    } else config.headers = { ...(config.headers || {}), 'X-Workspace-Id': String(teamId), 'X-Team-Id': String(teamId) };
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const edit = response.config?.assetEdit;
    if (edit) {
      if (response.data?.editingSessionRetained === true) advanceEditContext(edit.assetId, edit.token, response.data.revision);
      else clearEditContext(edit.assetId, edit.token);
    }
    return response;
  },
  (error) => {
    if (error.config?.assetEdit && ['LOCK_EXPIRED', 'ASSET_LOCKED', 'REVISION_CONFLICT', 'PERMISSION_CHANGED', 'ASSET_TRASHED'].includes(error.response?.data?.code)) {
      clearEditContext(error.config.assetEdit.assetId, error.config.assetEdit.token, 'expired');
    }
    const hasSession = Boolean(readStoredSession()?.token);
    const invalidToken = error.response?.status === 400 && error.response?.data?.message === 'Invalid token.';
    const unauthorizedSession = error.response?.status === 401 && hasSession;
    const inactiveSession = error.response?.status === 403 && error.response?.data?.message === 'Account is inactive.';
    if (invalidToken || unauthorizedSession || inactiveSession) {
      clearStoredSession();
      setAuthorizationToken(null);
      window.dispatchEvent(new Event('aether:session-expired'));
      const reason = inactiveSession ? 'account-inactive' : 'session-expired';
      if (!window.location.pathname.startsWith('/login')) window.location.assign(`/login?reason=${reason}`);
    }
    if (error.response?.status === 403 && !inactiveSession
        && /^\/?assets(?:\/|$)/.test(error.config?.url || '')) {
      window.dispatchEvent(new Event('aether:workspace-permissions-changed'));
    }
    return Promise.reject(error);
  },
);

export function getApiError(error, fallback = 'Something went wrong. Please try again.') {
  return error.response?.data?.message || (error.code === 'ECONNABORTED' ? 'The request timed out.' : fallback);
}

export default api;
