import { Link } from 'react-router-dom';
export const roleName = role => ({ workspaceOwner: 'Owner', workspaceManager: 'Manager', collaborator: 'Collaborator', system: 'System', systemAdministrator: 'System administrator' }[role] || role || 'Member');
const titles = {
  'workspace.created': 'Created workspace', 'workspace.renamed': 'Renamed workspace', 'workspace.invite_regenerated': 'Regenerated invite code',
  'member.joined': 'Joined workspace', 'member.removed': 'Removed member', 'member.role_changed': 'Changed member role',
  'member.access_changed': 'Changed member account access',
  'asset.uploaded': 'Uploaded asset', 'asset.snapshot_created': 'Preserved file snapshot', 'asset.version_uploaded': 'Submitted a new file version',
  'asset.renamed': 'Renamed asset', 'asset.tags_changed': 'Updated tags', 'asset.metadata_changed': 'Updated metadata',
  'asset.ai_requested': 'Requested AI suggestions', 'asset.ai_suggestions_ready': 'AI suggestions ready (not applied)', 'asset.ai_completed': 'Applied AI suggestions', 'asset.ai_reviewed': 'Reviewed AI suggestions', 'asset.ai_failed': 'AI processing failed',
  'asset.trashed': 'Moved to recycle bin', 'asset.restored': 'Restored asset', 'asset.objected_restored': 'Objected and restored asset',
  'asset.purge_started': 'Started permanent cleanup', 'asset.purge_completed': 'Completed permanent cleanup', 'asset.purge_failed': 'Cleanup failed; retry scheduled', 'asset.purge_paused': 'Paused cleanup', 'asset.purge_rescheduled': 'Started a new 7-day recovery period',
  'comment.created': 'Added comment or reply', 'comment.updated': 'Edited comment', 'comment.deleted': 'Deleted comment',
  'lock.acquired': 'Started editing', 'lock.released': 'Ended editing', 'lock.expired': 'Editing session expired', 'lock.revoked': 'Editing session ended after permission change'
};
const ignored = new Set(['revision', 'contentVersionId', 'baseContentVersionId']);
function flatten(value, prefix = '', output = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(value)) if (!ignored.has(key)) flatten(item, prefix ? `${prefix}.${key}` : key, output);
  } else if (prefix) output[prefix] = value;
  return output;
}
const display = value => value == null ? '—' : Array.isArray(value) ? value.join(', ') || '(empty)' : typeof value === 'boolean' ? String(value) : String(value);
export function auditChanges(before, after) {
  const a = flatten(before); const b = flatten(after);
  const format = (key, value) => value == null ? '—' : key === 'role' ? roleName(value) : key === 'isActive' ? (value ? 'Active' : 'Inactive') : display(value);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key])).map(key => ({ key, before: format(key, a[key]), after: format(key, b[key]) }));
}
export default function AuditEvent({ event, onViewVersions }) {
  const changes = auditChanges(event.before, event.after);
  const download = event.action === 'asset.download';
  const downloadTitle = { requested: 'Download requested', completed: 'Server finished sending the download', interrupted: 'Download transfer interrupted', failed: 'Download failed' };
  const title = download ? downloadTitle[event.result] || 'Download' : titles[event.action] || event.action;
  const versionId = event.details?.versionId || event.details?.preservedVersionId;
  const versionEvent = ['asset.snapshot_created', 'asset.version_uploaded'].includes(event.action);
  const roleChange = event.action === 'member.role_changed';
  const failed = ['failed', 'denied', 'interrupted'].includes(event.result);
  return <article className="border-b border-white/[0.08] py-5 last:border-0">
    <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 break-words text-sm font-semibold text-zinc-100">{event.result === 'denied' ? 'Blocked: ' : ''}{title}</h3><span className={`rounded px-2 py-0.5 text-xs ${failed ? 'bg-amber-400/10 text-amber-200' : 'bg-emerald-400/10 text-emerald-200'}`}>{event.result}</span></div>
    <p className="mt-2 break-words text-sm text-zinc-300">{event.actorName} · {roleName(event.actorRole)}</p>
    <time className="mt-1 block text-xs text-zinc-400" dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString()}</time>
    {event.targetName && <p className="mt-2 break-words text-sm">{event.assetId && event.assetAvailable ? <Link className="text-violet-300 underline" to={`/assets/${event.assetId}`}>{event.targetName}</Link> : <span>{event.targetName}</span>}{event.assetId && !event.assetAvailable && <span className="ml-2 text-xs text-zinc-400">Unavailable in library</span>}</p>}
    {roleChange && <p className="mt-2 text-sm text-zinc-300">{event.details?.memberName || `Member #${event.after?.userId || event.before?.userId}`} : {roleName(event.before?.role)} → {roleName(event.after?.role)}</p>}
    {event.details?.reason && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-300">Reason: {event.details.reason}</p>}
    {download && <p className="mt-2 text-xs text-zinc-400">Server transfer status does not confirm the file was saved on the device.</p>}
    {versionEvent && event.assetAvailable && (onViewVersions ? <button className="secondary-button mt-3" onClick={() => onViewVersions(versionId)}>View file history</button> : <Link className="secondary-button mt-3" to={`/assets/${event.assetId}?panel=versions${versionId ? `&version=${versionId}` : ''}`}>View file history</Link>)}
    <details className="mt-3"><summary className="cursor-pointer text-xs text-violet-300">Change details</summary><div className="mt-3 max-h-80 space-y-3 overflow-y-auto rounded border border-white/10 p-3">
      {changes.length ? changes.map(change => <div key={change.key} className="break-words text-xs"><p className="font-medium text-zinc-200">{change.key.replace(/^metadata\./, '').replace(/([a-z])([A-Z])/g, '$1 $2')}</p><p className="mt-1 whitespace-pre-wrap text-zinc-400">Before: {change.before}</p><p className="mt-1 whitespace-pre-wrap text-zinc-200">After: {change.after}</p></div>) : <p className="text-xs text-zinc-400">{failed ? 'No successful content change is recorded by this event.' : 'No field differences are available for this event.'}</p>}
      {event.details?.addedTags?.length > 0 && <p className="text-xs">Added tags: {event.details.addedTags.join(', ')}</p>}
      {event.details?.removedTags?.length > 0 && <p className="text-xs">Removed tags: {event.details.removedTags.join(', ')}</p>}
      {event.details?.purgeAfter && <p className="text-xs">Recovery deadline: {new Date(event.details.purgeAfter).toLocaleString()}</p>}
      {event.details?.versionNumber && <p className="text-xs">Preserved snapshot: v{event.details.versionNumber}</p>}
      {event.details?.format && <p className="text-xs">Download format: {event.details.format}</p>}
      {event.details?.applied === false && <p className="text-xs">Suggestions were not applied by this event.</p>}
      {event.details?.httpStatus && <p className="text-xs">Request returned status {event.details.httpStatus}.</p>}
    </div></details>
  </article>;
}
