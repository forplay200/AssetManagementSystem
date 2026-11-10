import { useEffect, useRef, useState } from 'react';
import Dialog from '../common/Dialog';
import { assetService } from '../../services/assetService';
import { getApiError } from '../../services/api';
import { getAssetDisplayName } from '../../utils/assetDisplayName';
import { useUnsavedChanges } from '../../context/UnsavedChangesContext';
export default function TrashAssetDialog({ asset, userId, onClose, onTrashed }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useUnsavedChanges(Boolean(reason.trim()), 'Deletion reason', busy);
  const required = Number(userId) !== Number(asset.userId);
  const submit = async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await assetService.remove(asset.id, reason.trim()); if (mounted.current) onTrashed(); }
    catch (e) { if (mounted.current) { setError(getApiError(e)); setBusy(false); } }
  };
  return <Dialog open title="Move to recycle bin?" description={`${getAssetDisplayName(asset)} will be hidden from the library. Files, versions and comments are kept for 7 days. The original uploader will be notified and can object to restore the asset immediately.`} busy={busy} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4"><label className="block"><span className="label">Deletion reason {required ? '(required for another member’s asset)' : '(optional)'}</span><textarea className="input mt-2 min-h-24 w-full" maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} required={required} disabled={busy} /></label>{error && <p role="alert" className="text-sm text-red-200">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button><button className="danger-button" disabled={busy || (required && !reason.trim())}>{busy ? 'Moving…' : 'Move to recycle bin'}</button></div></form>
  </Dialog>;
}
