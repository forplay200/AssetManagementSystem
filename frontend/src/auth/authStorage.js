export const AUTH_STORAGE_KEY = 'aether.session';

export function readStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY)) || null;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function writeStoredSession(session) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function clearStoredSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}
