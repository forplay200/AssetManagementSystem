import { MessageSquare, Upload, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDateTime } from '../../utils/formatters';

export default function ActivityFeed({ recentUploads = [], recentUsers = [], totalComments = 0 }) {
  const events = [
    ...recentUploads.map((asset) => ({ id: `asset-${asset.id}`, type: 'upload', date: asset.uploadedAt, title: asset.filename, detail: `${asset.uploader?.username || 'A team member'} uploaded an asset`, assetId: asset.id })),
    ...recentUsers.map((user) => ({ id: `user-${user.id}`, type: 'user', date: user.createdAt, title: user.username, detail: 'Joined the workspace' })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);

  const icons = { upload: Upload, user: UserPlus };
  return (
    <section className="panel overflow-hidden">
      <div className="section-title m-5 mb-0"><MessageSquare size={16} className="text-aether-secondary" /> Activity feed <span className="ml-auto font-mono text-[10px] uppercase text-zinc-600">{totalComments} discussions</span></div>
      {events.length ? <div className="mt-4 divide-y divide-white/[0.06]">{events.map((event) => {
        const Icon = icons[event.type];
        const content = <><span className={`grid h-8 w-8 shrink-0 place-items-center rounded border ${event.type === 'upload' ? 'border-violet-400/20 bg-violet-400/[0.08] text-violet-300' : 'border-blue-400/20 bg-blue-400/[0.08] text-blue-300'}`}><Icon size={14} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-zinc-300">{event.title}</p><p className="mt-1 text-xs text-zinc-600">{event.detail}</p><time className="mt-1.5 block font-mono text-[9px] uppercase tracking-wide text-zinc-700">{formatDateTime(event.date)}</time></div></>;
        return event.assetId ? <Link key={event.id} to={`/assets/${event.assetId}`} className="flex gap-3 px-5 py-4 transition hover:bg-white/[0.025]">{content}</Link> : <div key={event.id} className="flex gap-3 px-5 py-4">{content}</div>;
      })}</div> : <div className="px-6 py-12 text-center text-sm text-zinc-600">Workspace activity will appear here.</div>}
    </section>
  );
}
