import { useEffect, useRef, useState } from 'react';
import { Check, CornerDownRight, LoaderCircle, MessageSquare, Pencil, Reply, Send, Trash2, UserRound, X } from 'lucide-react';
import Dialog from '../common/Dialog';
import ExpandableText from '../common/ExpandableText';
import useConfirmation from '../../hooks/useConfirmation';
import { useUnsavedChanges } from '../../context/UnsavedChangesContext';
import { useAuth } from '../../context/AuthContext';
import { WORKSPACE_ROLES } from '../../auth/roles';
import { getApiError } from '../../services/api';
import { assetService } from '../../services/assetService';
import { formatDateTime } from '../../utils/formatters';

export function canManageComment(user, comment) {
  return !comment?.isDeleted && (user?.teamRole === WORKSPACE_ROLES.OWNER || Number(comment?.userId) === Number(user?.id));
}

export function wasEdited(comment) {
  if (!comment?.createdAt || !comment?.updatedAt || comment.isDeleted) return false;
  return new Date(comment.updatedAt).getTime() > new Date(comment.createdAt).getTime();
}

function DeleteCommentDialog({ comment, deleting, error, onCancel, onConfirm }) {
  return <Dialog open={Boolean(comment)} title="Delete this comment?" description="The original text will be hidden, but the comment record and its replies will remain in the discussion." busy={deleting} onClose={onCancel} footer={<><button className="secondary-button" data-autofocus onClick={onCancel} disabled={deleting}>Cancel</button><button className="danger-button" onClick={onConfirm} disabled={deleting}>{deleting ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}{deleting ? 'Deleting…' : 'Delete comment'}</button></>}>
    {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
  </Dialog>;
}

export default function CommentThread({ assetId }) {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, comments: [], total: 0, page: 1, totalPages: 1, error: '' });
  const [draft, setDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [pendingAction, setPendingAction] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const { confirm, confirmation } = useConfirmation();
  const sequence = useRef(0);
  useUnsavedChanges(Boolean(draft.trim() || (editing && editing.content !== editing.original)), 'Discussion draft', Boolean(pendingAction));

  const load = async (page = 1) => {
    const request = ++sequence.current;
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await assetService.getComments(assetId, { page, pageSize: 20 });
      if (request !== sequence.current) return;
      setState({ loading: false, comments: response.comments || [], total: response.totalItems || 0, page: response.currentPage || page, totalPages: response.totalPages || 1, error: '' });
    } catch (requestError) {
      if (request !== sequence.current) return;
      setState((current) => ({ ...current, loading: false, error: getApiError(requestError, 'The discussion could not be loaded.') }));
    }
  };

  useEffect(() => { load(); return () => { sequence.current++; }; }, [assetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (event) => {
    event.preventDefault();
    const content = draft.trim();
    if (pendingAction || !content) return;
    setPendingAction('create');
    setState((current) => ({ ...current, error: '' }));
    try {
      await assetService.createComment(assetId, content, replyingTo?.id || null);
      setDraft('');
      setReplyingTo(null);
      await load(state.page);
    } catch (requestError) {
      setState((current) => ({ ...current, error: getApiError(requestError, 'Your comment could not be posted.') }));
    } finally {
      setPendingAction('');
    }
  };

  const changePage = async page => {
    if (editing && editing.content !== editing.original && !await confirm({ title: 'Discard comment edits?', description: 'Your unsaved edits will be lost when you change pages.', confirmLabel: 'Discard edits', cancelLabel: 'Keep editing' })) return;
    setEditing(null);
    load(page);
  };

  const beginReply = (comment) => {
    if (pendingAction) return;
    setReplyingTo(comment);
    document.getElementById('comment-composer')?.focus();
  };

  const beginEdit = async (comment) => {
    if (pendingAction) return;
    if (editing && editing.content !== editing.original && !await confirm({ title: "Discard comment edits?", description: "Your unsaved edits will be lost.", confirmLabel: "Discard edits" })) return;
    setEditing({ id: comment.id, content: comment.content, original: comment.content });
    setState((current) => ({ ...current, error: '' }));
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    const content = editing?.content.trim();
    if (pendingAction || !content) return;
    setPendingAction(`edit-${editing.id}`);
    try {
      await assetService.updateComment(editing.id, content);
      setEditing(null);
      await load(state.page);
    } catch (requestError) {
      setState((current) => ({ ...current, error: getApiError(requestError, 'The comment could not be updated.') }));
    } finally {
      setPendingAction('');
    }
  };

  const confirmDelete = async () => {
    if (pendingAction || !deleteTarget) return;
    setDeleteError('');
    setPendingAction(`delete-${deleteTarget.id}`);
    try {
      await assetService.deleteComment(deleteTarget.id);
      setDeleteTarget(null);
      if (editing?.id === deleteTarget.id) setEditing(null);
      await load(state.page);
    } catch (requestError) {
      setDeleteError(getApiError(requestError, 'The comment could not be deleted.'));
    } finally {
      setPendingAction('');
    }
  };

  return (
    <section className="panel overflow-hidden" aria-labelledby="comments-heading">
      <div className="border-b border-white/[0.08] px-5 py-4">
        <h2 id="comments-heading" className="flex items-center gap-2 font-display text-sm font-semibold text-zinc-100"><MessageSquare size={16} className="text-aether-secondary" /> Discussion <span className="font-mono text-xs text-zinc-400">{state.total}</span></h2>
        <p className="mt-1 text-xs text-zinc-400">Feedback and reply history for this asset.</p>
      </div>

      <form className="border-b border-white/[0.08] bg-black/15 p-5" onSubmit={submit}>
        <div className="flex gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-violet-500/15 text-aether-primary"><UserRound size={17} /></span>
          <div className="min-w-0 flex-1">
            {replyingTo && <div className="mb-2 flex items-center justify-between rounded border border-blue-400/15 bg-blue-400/[0.06] px-3 py-2 text-xs text-blue-200/80"><span className="flex min-w-0 items-center gap-2"><CornerDownRight size={13} /><span className="truncate">Replying to {replyingTo.author?.username || 'a team member'}</span></span><button type="button" onClick={() => setReplyingTo(null)} className="tag-action" disabled={Boolean(pendingAction)} aria-label="Cancel reply"><X size={14} /></button></div>}
            <textarea disabled={Boolean(pendingAction)} aria-label="Comment" id="comment-composer" className="input min-h-24 w-full resize-y py-3" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder={replyingTo ? 'Write a reply…' : 'Share feedback or ask a question…'} required />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="font-mono text-xs text-zinc-400">Posting as {user?.username} · {draft.length}/2000</span><button className="primary-button" disabled={Boolean(pendingAction) || !draft.trim()}>{pendingAction === 'create' ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}{pendingAction === 'create' ? 'Posting…' : replyingTo ? 'Post reply' : 'Post comment'}</button></div>
          </div>
        </div>
      </form>

      {state.error && <div className="m-5 rounded border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">{state.error}</div>}
      {state.loading ? <div className="grid min-h-40 place-items-center"><LoaderCircle className="animate-spin text-aether-primary" size={20} /></div> : state.comments.length ? (
        <div className="divide-y divide-white/[0.06]">
          {state.comments.map((comment) => {
            const editable = canManageComment(user, comment);
            const isEditing = editing?.id === comment.id;
            const editPending = pendingAction === `edit-${comment.id}`;
            return (
              <article key={comment.id} className={`px-5 py-5 ${comment.parentId ? 'bg-white/[0.015] pl-9 sm:pl-14' : ''}`}>
                {comment.parent && <p className="mb-3 flex items-center gap-2 truncate border-l-2 border-blue-400/30 pl-3 text-xs text-zinc-400"><CornerDownRight size={12} className="shrink-0" />{comment.parent.content}</p>}
                <div className="flex gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-zinc-800 font-display text-xs font-semibold text-zinc-400">{(comment.author?.username || '?').slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h3 className="text-sm font-medium text-zinc-200">{comment.author?.username || 'Unknown user'}</h3><time className="font-mono text-xs uppercase text-zinc-400" dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>{comment.parentId && <span className="font-mono text-xs uppercase text-blue-300/70">Reply</span>}</div>
                    {isEditing ? (
                      <form className="mt-3" onSubmit={saveEdit}>
                        <textarea disabled={Boolean(pendingAction)} aria-label="Edit comment" className="input min-h-24 w-full resize-y py-3" value={editing.content} onChange={(event) => setEditing({ ...editing, content: event.target.value })} maxLength={2000} required autoFocus />
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><span className="font-mono text-xs text-zinc-400">{editing.content.length}/2000</span><div className="flex gap-2"><button type="button" className="secondary-button" onClick={async () => { if (editing.content === editing.original || await confirm({ title: "Discard comment edits?", description: "Your unsaved edits will be lost.", confirmLabel: "Discard edits" })) setEditing(null); }} disabled={Boolean(pendingAction)}><X size={14} /> Cancel</button><button className="primary-button" disabled={Boolean(pendingAction) || !editing.content.trim()}>{editPending ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}{editPending ? 'Saving…' : 'Save edit'}</button></div></div>
                      </form>
                    ) : (
                      <>
                        <ExpandableText value={comment.content} label="Comment" className={`mt-2 ${comment.isDeleted ? "italic" : ""}`} />
                        {wasEdited(comment) && <p className="mt-1.5 font-mono text-xs text-zinc-400">Edited {formatDateTime(comment.updatedAt)}</p>}
                        {!comment.isDeleted && <div className="mt-3 flex flex-wrap items-center gap-3"><button className="inline-flex min-h-9 items-center gap-1.5 text-sm text-zinc-400 transition hover:text-blue-300" disabled={Boolean(pendingAction)} onClick={() => beginReply(comment)}><Reply size={13} /> Reply</button>{editable && <><button className="inline-flex min-h-9 items-center gap-1.5 text-sm text-zinc-400 transition hover:text-violet-300" disabled={Boolean(pendingAction)} onClick={() => beginEdit(comment)}><Pencil size={13} /> Edit</button><button className="inline-flex min-h-9 items-center gap-1.5 text-sm text-zinc-400 transition hover:text-red-300" disabled={Boolean(pendingAction)} onClick={() => { setDeleteError(''); setDeleteTarget(comment); }}><Trash2 size={13} /> Delete</button></>}</div>}
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : !state.error && <div className="px-6 py-12 text-center"><MessageSquare className="mx-auto text-zinc-700" size={27} /><p className="mt-3 text-sm font-medium text-zinc-300">Start the discussion</p><p className="mt-1 text-xs text-zinc-400">Be the first teammate to leave feedback on this asset.</p></div>}

      {state.totalPages > 1 && <div className="flex items-center justify-between border-t border-white/[0.08] px-5 py-4"><button className="secondary-button" disabled={Boolean(pendingAction) || state.loading || state.page <= 1} onClick={() => changePage(state.page - 1)}>Previous</button><span className="font-mono text-xs uppercase text-zinc-400">Page {state.page} / {state.totalPages}</span><button className="secondary-button" disabled={Boolean(pendingAction) || state.loading || state.page >= state.totalPages} onClick={() => changePage(state.page + 1)}>Next</button></div>}
      {confirmation}
      <DeleteCommentDialog error={deleteError} comment={deleteTarget} deleting={pendingAction === `delete-${deleteTarget?.id}`} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
    </section>
  );
}
