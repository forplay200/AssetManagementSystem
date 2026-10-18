import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { clearStoredSession, readStoredSession, writeStoredSession } from '../auth/authStorage';
import { setAuthorizationToken } from '../services/api';
import { authService } from '../services/authService';
import { teamService } from '../services/teamService';
import { ACCOUNT_ROLES } from '../auth/roles';

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
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const namesRef = useRef({});
  const revisionRef = useRef(0);
  const revisionsRef = useRef({});
  const [workspaceNames, setWorkspaceNames] = useState({});
  const getNameRevision = useCallback(() => revisionRef.current, []);
  // Only overlay renames newer than the request; a later fresh read may reflect another member's rename.
  const applyWorkspaceName = useCallback((team, requestRevision = -1) => team && (revisionsRef.current[team.id] ?? -1) > requestRevision ? { ...team, name: namesRef.current[team.id] } : team, []);
  const updateWorkspaceName = useCallback((team, expectedToken) => {
    if (!sessionRef.current || sessionRef.current.token !== expectedToken) return;
    revisionsRef.current = { ...revisionsRef.current, [team.id]: ++revisionRef.current };
    namesRef.current = { ...namesRef.current, [team.id]: team.name };
    setWorkspaceNames(namesRef.current);
    setSession(current => {
      if (!current || current.token !== expectedToken || String(current.user.team?.id) !== String(team.id)) return current;
      const next = { ...current, user: { ...current.user, team: { ...current.user.team, name: team.name } } };
      writeStoredSession(next); return next;
    });
  }, []);

  const storeSession = useCallback((nextSession) => {
    namesRef.current = {}; revisionsRef.current = {}; setWorkspaceNames({}); sessionRef.current = nextSession;
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
      sessionRef.current = null; namesRef.current = {}; revisionsRef.current = {}; setWorkspaceNames({});
      clearStoredSession();
      setAuthorizationToken(null);
      setSession(null);
    }
  }, []);

  const activateTeam = useCallback((team, teamRole, expectedSession) => {
    setSession((current) => {
      if (!current) return current;
      if (expectedSession && (current.token !== expectedSession.token
          || current.user.team?.id !== expectedSession.workspaceId)) return current;
      const nextSession = {
        ...current,
        user: { ...current.user, team: expectedSession ? applyWorkspaceName(team, expectedSession.nameRevision) : team, teamRole, role: teamRole },
      };
      writeStoredSession(nextSession);
      return nextSession;
    });
  }, [applyWorkspaceName]);

  const refreshTeam = useCallback(async () => {
    if (!session?.user?.team?.id) return null;
    const expectedSession = { token: session.token, workspaceId: session.user.team.id, nameRevision: getNameRevision() };
    try {
      const result = await teamService.current();
      activateTeam({ id: result.team.id, name: result.team.name }, result.role, expectedSession);
      return result;
    } catch (error) {
      if ([403, 404].includes(error.response?.status)) {
        setSession((current) => {
          if (!current) return current;
          if (current.token !== expectedSession.token || current.user.team?.id !== expectedSession.workspaceId) return current;
          const accountRole = current.user.accountRole || ACCOUNT_ROLES.USER;
          const nextSession = { ...current, user: { ...current.user, team: null, teamRole: null, role: accountRole } };
          writeStoredSession(nextSession);
          return nextSession;
        });
      }
      return null;
    }
  }, [session?.token, session?.user?.team?.id, activateTeam, getNameRevision]);

  useEffect(() => {
    const refreshPermissions = () => { refreshTeam(); };
    window.addEventListener('aether:workspace-permissions-changed', refreshPermissions);
    return () => window.removeEventListener('aether:workspace-permissions-changed', refreshPermissions);
  }, [refreshTeam]);

  const value = useMemo(
    () => ({
      isAuthenticated: Boolean(session?.token),
      token: session?.token || null,
      user: session?.user || null,
      login,
      register,
      activateTeam,
      refreshTeam,
      updateWorkspaceName, applyWorkspaceName, workspaceNames, getNameRevision,
      logout,
    }),
    [session, login, register, activateTeam, refreshTeam, logout, updateWorkspaceName, applyWorkspaceName, workspaceNames, getNameRevision],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
