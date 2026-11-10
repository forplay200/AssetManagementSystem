import { useId, useState } from 'react';

export default function ExpandableList({ items, renderItem, limit = 6, className = 'space-y-2', label = 'items' }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <div className="min-w-0"><div id={id} className={className}>{(expanded ? items : items.slice(0, limit)).map(renderItem)}</div>{items.length > limit && <button type="button" className="secondary-button mt-3 h-9 text-xs" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show fewer' : `Show all ${items.length} ${label}`}</button>}</div>;
}
