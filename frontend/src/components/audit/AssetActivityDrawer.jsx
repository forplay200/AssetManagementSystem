import Dialog from '../common/Dialog';
import AuditFeed from './AuditFeed';
export default function AssetActivityDrawer({ open, assetId, onClose, onViewVersions }) {
  return <Dialog open={open} drawer title="Asset activity" description="Changes, downloads, comments and editing sessions for this asset." onClose={onClose}>{open && <AuditFeed assetId={assetId} onViewVersions={onViewVersions} />}</Dialog>;
}
