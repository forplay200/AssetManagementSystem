import PageHeader from '../components/common/PageHeader';
import AuditFeed from '../components/audit/AuditFeed';
export default function WorkspaceAuditLogPage() {
  return <><PageHeader eyebrow="Workspace" title="Audit log" description="Management activity, important file events and changes to other members’ assets. Personal tag and metadata edits remain in each asset’s Activity." /><section className="panel p-5"><AuditFeed /></section></>;
}
