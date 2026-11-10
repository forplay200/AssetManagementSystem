import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import Dialog from '../common/Dialog';
import { recycleBinService } from '../../services/recycleBinService';
import { getApiError } from '../../services/api';

function notificationMessage(notification) {
  if (notification.type === 'asset.trashed') {
    if (notification.content.deletedBy === notification.recipientId && notification.recipientId != null) {
      return 'Moved to recycle bin. You can restore this asset before the deadline.';
    }
    return 'Moved to recycle bin. You can object to restore before the deadline.';
  }
  return notification.type === 'asset.objected_restored' ? 'The uploader objected and the asset was restored.' : 'The asset was restored.';
}
export default function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ notifications: [], unread: 0, total: 0, pageSize: 30 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    try { const result = await recycleBinService.notifications(page); if (request === sequence.current) { setData(result); setError(''); } }
    catch (e) { if (request === sequence.current) setError(getApiError(e)); }
  }, [page]);
  useEffect(() => { const requests = sequence; load(); const timer = setInterval(load, 60000); window.addEventListener('aether:notifications-changed', load); return () => { requests.current++; clearInterval(timer); window.removeEventListener('aether:notifications-changed', load); }; }, [load]);
  return <><button className="secondary-button h-9" aria-label={`Notifications, ${data.unread} unread`} onClick={() => { setOpen(true); load(); }}><Bell size={16} />{data.unread > 0 && <span>{data.unread}</span>}</button><Dialog open={open} title="Notifications" onClose={() => setOpen(false)}>
    {error && <p role="alert" className="mb-3 text-red-200">{error}</p>}
    {!data.notifications.length && <p className="text-sm text-zinc-400">No notifications.</p>}
    <div className="space-y-4">{data.notifications.map(notification => <article key={notification.id} className="rounded border border-white/10 p-4"><h3 className="break-words font-semibold">{notification.content.name}</h3><p className="mt-1 text-sm text-zinc-400">{notificationMessage(notification)}</p><p className="mt-2 text-xs text-zinc-400">{new Date(notification.createdAt).toLocaleString()}</p>{notification.type === 'asset.trashed' && <p className="mt-1 text-xs text-zinc-400">Recovery deadline: {new Date(notification.content.purgeAfter).toLocaleString()}. Paused cases may receive an updated deadline.</p>}{notification.content.reason && <p className="mt-2 break-words text-sm">Reason: {notification.content.reason}</p>}<div className="mt-3 flex flex-wrap gap-2"><Link className="secondary-button" to={`/recycle-bin?cycle=${notification.cycleId}`} onClick={() => setOpen(false)}>Review deletion</Link>{!notification.readAt && <button className="secondary-button" disabled={busy} onClick={async () => { setBusy(true); try { await recycleBinService.markRead(notification.id); await load(); } catch (e) { setError(getApiError(e)); } finally { setBusy(false); } }}>Mark read</button>}</div></article>)}</div>
    <div className="mt-4 flex justify-between"><button className="secondary-button" disabled={page === 1 || busy} onClick={() => setPage(p => p - 1)}>Previous</button><button className="secondary-button" disabled={page * data.pageSize >= data.total || busy} onClick={() => setPage(p => p + 1)}>Next</button></div>
  </Dialog></>;
}
