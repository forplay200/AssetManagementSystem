import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { clearStoredSession, readStoredSession, writeStoredSession } from '../auth/authStorage';
import { setAuthorizationToken } from '../services/api';
import { authService } from '../services/authService';
import { teamService } from '../services/teamService';

const AuthContext = createContext(null);

function readTokenPayload(token) {
  try {
    const value = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(value.padEnd(Math.ceil(value.length / 4) * 4, '=')));
  } catch { return null; }
}

export function isTokenExpired(token, now = Date.now()) {
  const payload = token ? readTokenPayload(token) : null;
  return !payload?.exp || payload.exp * 1000 <= now;
}

function readSession() {
  const stored = readStoredSession();
  if (!stored?.token || isTokenExpired(stored.token)) {
    clearStoredSession();
    setAuthorizationToken(null);
    return null;
  }
  setAuthorizationToken(stored.token);
  return stored;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession);

  const storeSession = useCallback((nextSession) => {
    writeStoredSession(nextSession);
    setAuthorizationToken(nextSession.token);
    setSession(nextSession);
    return nextSession;
  }, []);

  const login = useCallback(async (credentials) => {
    return storeSession(await authService.login(credentials));
  }, [storeSession]);

  const register = useCallback(async (account) => {
    return storeSession(await authService.register(account));
  }, [storeSession]);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      clearStoredSession();
      setAuthorizationToken(null);
      setSession(null);
    }
  }, []);

  const activateTeam = useCallback((team, teamRole) => {
    setSession((current) => {
      if (!current) return current;
      const nextSession = {
        ...current,
        user: { ...current.user, team, teamRole, role: teamRole },
      };
      writeStoredSession(nextSession);
      return nextSession;
    });
  }, []);

  const refreshTeam = useCallback(async () => {
    if (!session?.user?.team?.id) return null;
    try {
      const result = await teamService.current();
      activateTeam({ id: result.team.id, name: result.team.name }, result.role);
      return result;
    } catch (error) {
      if ([403, 404].includes(error.response?.status)) {
        setSession((current) => {
          if (!current) return current;
          const accountRole = current.user.accountRole || 'user';
          const nextSession = { ...current, user: { ...current.user, team: null, teamRole: null, role: accountRole } };
          writeStoredSession(nextSession);
          return nextSession;
        });
      }
      return null;
    }
  }, [session?.user?.team?.id, activateTeam]);

  const value = useMemo(
    () => ({
      isAuthenticated: Boolean(session?.token),
      token: session?.token || null,
      user: session?.user || null,
      login,
      register,
      activateTeam,
      refreshTeam,
      logout,
    }),
    [session, login, register, activateTeam, refreshTeam, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
