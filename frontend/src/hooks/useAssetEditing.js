import { useCallback, useEffect, useRef, useState } from 'react';
import { assetService } from '../services/assetService';
import { advanceEditContext, clearEditContext, editContextKey, getEditContext, setEditContext } from '../services/assetEditContext';
import { getApiError } from '../services/api';

export default function useAssetEditing(assetId, enabled, identity) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  const owned = useRef(null);
  const statusSequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const generation = epoch.current;
    const request = ++statusSequence.current;
    const atStart = owned.current;
    try {
      const value = await assetService.editStatus(assetId);
      if (generation !== epoch.current || request !== statusSequence.current || owned.current !== atStart) return;
      setStatus(value);
      const saved = getEditContext(assetId);
      if (!saved) return;
      if (!value.locked || value.sessionId !== saved.sessionId) {
        clearEditContext(assetId, saved.token, 'expired');
      } else {
        advanceEditContext(assetId, saved.token, value.revision);
        if (!owned.current) {
          owned.current = getEditContext(assetId);
          setSession(owned.current);
        }
      }
    } catch (e) { if (generation === epoch.current) setError(getApiError(e, 'Unable to check editing status.')); }
  }, [assetId, enabled]);
  useEffect(() => {
    const lifecycle = epoch;
    lifecycle.current++;
    owned.current = null; setSession(null); setStatus(null); setError(''); setBusy(false);
    if (!enabled) return undefined;
    const key = editContextKey(assetId);
    const ended = event => {
      if (event.detail.key !== key) return;
      owned.current = null; setSession(null);
      if (event.detail.reason === 'expired') setError('Your editing session ended. Keep a copy of your changes and review the latest version before starting again.');
      refresh();
    };
    window.addEventListener('aether:asset-edit-ended', ended);
    const timer = setInterval(refresh, 10000);
    window.addEventListener('focus', refresh); refresh();
    return () => {
      lifecycle.current++;
      window.removeEventListener('aether:asset-edit-ended', ended);
      window.removeEventListener('focus', refresh); clearInterval(timer);
      // Stop renewing while away. Keep the tab's credentials so returning to
      // the asset can resume or cancel the same lease after checking its status.
      owned.current = null;
    };
  }, [assetId, enabled, identity, refresh]);
  useEffect(() => {
    if (!session) return undefined;
    const generation = epoch.current;
    const timer = setInterval(async () => {
      const current = getEditContext(assetId);
      if (current?.token !== session.token) return;
      try { await assetService.renewEditing(assetId, current); }
      catch (e) {
        if (generation !== epoch.current) return;
        setError(getApiError(e, 'Unable to renew editing. Check your connection.'));
        if (e.response?.status) clearEditContext(assetId, session.token, 'expired');
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [assetId, session]);
  const start = async () => {
    const generation = epoch.current;
    setBusy(true); setError('');
    try {
      const value = await assetService.startEditing(assetId);
      if (generation !== epoch.current) { assetService.endEditing(assetId, value).catch(() => {}); return false; }
      setEditContext(assetId, value); owned.current = value; setSession(value); await refresh(); return true;
    } catch (e) { if (generation === epoch.current) setError(getApiError(e, 'Unable to start editing.')); return false; }
    finally { if (generation === epoch.current) setBusy(false); }
  };
  const cancel = async () => {
    if (!session) return;
    setBusy(true);
    try { await assetService.endEditing(assetId, session); clearEditContext(assetId, session.token); setError(''); return true; }
    catch (e) { setError(getApiError(e, 'Unable to release the editing session.')); return false; }
    finally { setBusy(false); }
  };
  return { session, status, error, busy, start, cancel };
}
