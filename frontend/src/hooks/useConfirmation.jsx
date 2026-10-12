import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import Dialog from '../components/common/Dialog';
import { getApiError } from '../services/api';

export default function useConfirmation() {
  const [request, setRequest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(null);
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; pending.current?.(false); pending.current = null; }; }, []);
  const confirm = useCallback(options => {
    if (pending.current) return Promise.resolve(false);
    setError(''); setRequest(options);
    return new Promise(resolve => { pending.current = resolve; });
  }, []);
  const finish = value => {
    const resolve = pending.current;
    pending.current = null;
    if (mounted.current) { setRequest(null); setBusy(false); }
    resolve?.(value);
  };
  const execute = async () => {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try { await request.onConfirm?.(); finish(true); }
    catch (failure) { if (mounted.current) { setError(getApiError(failure, 'The action could not be completed. Please try again.')); setBusy(false); } }
    finally { running.current = false; }
  };
  const confirmation = <Dialog open={Boolean(request)} title={request?.title} description={request?.description} busy={busy} onClose={() => finish(false)} footer={<><button type="button" className="secondary-button" data-autofocus disabled={busy} onClick={() => finish(false)}>{request?.cancelLabel || 'Cancel'}</button><button type="button" className={request?.danger === false ? 'primary-button' : 'danger-button'} disabled={busy} onClick={execute}>{busy && <LoaderCircle size={16} className="animate-spin" />}{busy ? 'Working…' : request?.confirmLabel || 'Confirm'}</button></>}>
    {request?.details && <div className="rounded border border-white/10 bg-black/20 p-4 text-sm leading-6 [overflow-wrap:anywhere]">{request.details}</div>}
    {error && <p className="mt-4 text-sm text-red-200" role="alert">{error}</p>}
  </Dialog>;
  return { confirm, confirmation };
}
