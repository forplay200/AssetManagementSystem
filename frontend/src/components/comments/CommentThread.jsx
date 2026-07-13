import { useEffect, useState } from 'react';
import { CornerDownRight, LoaderCircle, MessageSquare, Reply, Send, UserRound, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getApiError } from '../../services/api';
import { assetService } from '../../services/assetService';
import { formatDateTime } from '../../utils/formatters';

export default function CommentThread({ assetId }) {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, comments: [], total: 0, page: 1, totalPages: 1, error: '' });
  const [draft, setDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async (page = 1) => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await assetService.getComments(assetId, { page, pageSize: 50 });
      setState({ loading: false, comments: response.comments || [], total: response.totalItems || 0, page: response.currentPage || page, totalPages: response.totalPages || 1, error: '' });
    } catch (requestError) {
      setState((current) => ({ ...current, loading: false, error: getApiError(requestError, 'The discussion could not be loaded.') }));
    }
  };

  useEffect(() => { load(); }, [assetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (event) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setSubmitting(true);
    setState((current) => ({ ...current, error: '' }));
    try {
      await assetService.createComment(assetId, content, replyingTo?.id || null);
      setDraft('');
      setReplyingTo(null);
      await load(state.page);
    } catch (requestError) {
      setState((current) => ({ ...current, error: getApiError(requestError, 'Your comment could not be posted.') }));
    } finally {
      setSubmitting(false);
    }
  };

  const beginReply = (comment) => {
    setReplyingTo(comment);
    setDraft('');
    document.getElementById('comment-composer')?.focus();
  };

  return (
    <section className="panel overflow-hidden" aria-labelledby="comments-heading">
      <div className="border-b border-white/[0.08] px-5 py-4">
        <h2 id="comments-heading" className="flex items-center gap-2 font-display text-sm font-semibold text-zinc-100"><MessageSquare size={16} className="text-aether-secondary" /> Discussion <span className="font-mono text-[10px] text-zinc-600">{state.total}</span></h2>
        <p className="mt-1 text-xs text-zinc-500">Feedback and reply history for this asset.</p>
      </div>

      <form className="border-b border-white/[0.08] bg-black/15 p-5" onSubmit={submit}>
        <div className="flex gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-violet-500/15 text-aether-primary"><UserRound size={17} /></span>
          <div className="min-w-0 flex-1">
            {replyingTo && <div className="mb-2 flex items-center justify-between rounded border border-blue-400/15 bg-blue-400/[0.06] px-3 py-2 text-xs text-blue-200/80"><span className="flex min-w-0 items-center gap-2"><CornerDownRight size={13} /><span className="truncate">Replying to {replyingTo.author?.username || 'a team member'}</span></span><button type="button" onClick={() => setReplyingTo(null)} className="p-1 text-zinc-500 hover:text-zinc-200" aria-label="Cancel reply"><X size={14} /></button></div>}
            <textarea id="comment-composer" className="input min-h-24 w-full resize-y py-3" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder={replyingTo ? 'Write a reply…' : 'Share feedback or ask a question…'} required />
            <div className="mt-3 flex items-center justify-between"><span className="font-mono text-[10px] text-zinc-600">Posting as {user?.username} · {draft.length}/2000</span><button className="primary-button" disabled={submitting || !draft.trim()}>{submitting ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}{submitting ? 'Posting…' : replyingTo ? 'Post reply' : 'Post comment'}</button></div>
          </div>
        </div>
      </form>

      {state.error && <div className="m-5 rounded border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">{state.error}</div>}
      {state.loading ? <div className="grid min-h-40 place-items-center"><LoaderCircle className="animate-spin text-aether-primary" size={20} /></div> : state.comments.length ? (
        <div className="divide-y divide-white/[0.06]">
          {state.comments.map((comment) => (
            <article key={comment.id} className={`px-5 py-5 ${comment.parentId ? 'bg-white/[0.015] pl-9 sm:pl-14' : ''}`}>
              {comment.parent && <p className="mb-3 flex items-center gap-2 truncate border-l-2 border-blue-400/30 pl-3 text-xs text-zinc-600"><CornerDownRight size={12} className="shrink-0" />{comment.parent.content}</p>}
              <div className="flex gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-zinc-800 font-display text-xs font-semibold text-zinc-400">{(comment.author?.username || '?').slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h3 className="text-sm font-medium text-zinc-200">{comment.author?.username || 'Unknown user'}</h3><time className="font-mono text-[10px] uppercase text-zinc-600" dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>{comment.parentId && <span className="font-mono text-[9px] uppercase text-blue-300/70">Reply</span>}</div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-400">{comment.content}</p><button className="mt-3 flex items-center gap-1.5 text-xs text-zinc-600 transition hover:text-blue-300" onClick={() => beginReply(comment)}><Reply size={13} /> Reply</button></div>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="px-6 py-12 text-center"><MessageSquare className="mx-auto text-zinc-700" size={27} /><p className="mt-3 text-sm font-medium text-zinc-300">Start the discussion</p><p className="mt-1 text-xs text-zinc-600">Be the first teammate to leave feedback on this asset.</p></div>}

      {state.totalPages > 1 && <div className="flex items-center justify-between border-t border-white/[0.08] px-5 py-4"><button className="secondary-button" disabled={state.page <= 1} onClick={() => load(state.page - 1)}>Previous</button><span className="font-mono text-[10px] uppercase text-zinc-600">Page {state.page} / {state.totalPages}</span><button className="secondary-button" disabled={state.page >= state.totalPages} onClick={() => load(state.page + 1)}>Next</button></div>}
    </section>
  );
}
