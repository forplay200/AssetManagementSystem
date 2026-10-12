import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import useConfirmation from '../hooks/useConfirmation';

const empty = { register: () => {}, unregister: () => {}, hasChanges: () => false, pending: false, requestLeave: async action => { action(); return true; } };
const Context = createContext(empty);

export function UnsavedChangesProvider({ children }) {
  const entries = useRef(new Map());
  const [revision, setRevision] = useState(0);
  const { confirm, confirmation } = useConfirmation();
  const register = useCallback((id, value) => { entries.current.set(id, value); setRevision(n => n + 1); }, []);
  const unregister = useCallback(id => { if (entries.current.delete(id)) setRevision(n => n + 1); }, []);
  const hasChanges = useCallback(() => entries.current.size > 0, []);
  const requestLeave = useCallback(async (action, { discard = false } = {}) => {
    const current = discard ? [] : Array.from(entries.current.values());
    if (current.some(entry => entry.pending)) {
      await confirm({ title: 'An action is still in progress', description: 'Wait for it to finish before leaving. Closing this page does not cancel a file that is already being saved.', confirmLabel: 'Keep waiting', cancelLabel: 'Stay here', danger: false });
      return false;
    }
    if (current.length && !await confirm({ title: 'Discard unsaved changes?', description: 'Your unsaved edits and selected files will be lost.', details: [...new Set(current.map(entry => entry.label))].join(' · '), confirmLabel: 'Discard and leave', cancelLabel: 'Keep editing' })) return false;
    entries.current.clear(); setRevision(n => n + 1);
    action(); return true;
  }, [confirm]);
  useEffect(() => {
    if (!entries.current.size) return undefined;
    const prevent = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [revision]);
  const pending = Array.from(entries.current.values()).some(entry => entry.pending);
  const value = useMemo(() => ({ register, unregister, hasChanges, requestLeave, pending }), [register, unregister, hasChanges, requestLeave, pending]);
  return <Context.Provider value={value}>{children}{confirmation}</Context.Provider>;
}

// Only mounted under the data router; ordinary component tests can use MemoryRouter.
export function NavigationGuard() {
  const { hasChanges, requestLeave } = useContext(Context);
  const blocker = useBlocker(useCallback(({ currentLocation, nextLocation }) => hasChanges() && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search), [hasChanges]));
  const handling = useRef(false);
  useEffect(() => {
    if (blocker.state !== 'blocked' || handling.current) return;
    handling.current = true;
    requestLeave(() => blocker.proceed()).then(allowed => { if (!allowed) blocker.reset(); }).finally(() => { handling.current = false; });
  }, [blocker, requestLeave]);
  return null;
}

export const useLeaveGuard = () => useContext(Context).requestLeave;
export const usePendingChanges = () => useContext(Context).pending;

export function useUnsavedChanges(dirty, label, pending = false) {
  const id = useId();
  const { register, unregister } = useContext(Context);
  useEffect(() => {
    if (dirty || pending) register(id, { label, pending }); else unregister(id);
    return () => unregister(id);
  }, [id, dirty, label, pending, register, unregister]);
  return useCallback(() => unregister(id), [id, unregister]);
}
