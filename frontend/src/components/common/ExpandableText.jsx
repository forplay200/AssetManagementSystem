import { useEffect, useId, useRef, useState } from 'react';
import { Copy, Download, Maximize2 } from 'lucide-react';
import Dialog from './Dialog';
import { saveDownload } from '../../services/assetService';

export default function ExpandableText({ value, label = 'Text', lines = 6, reader = false, className = '' }) {
  const text = String(value ?? '');
  const id = useId();
  const paragraph = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const element = paragraph.current;
    const measure = () => {
      const lineHeight = parseFloat(window.getComputedStyle(element).lineHeight) || 24;
      setOverflows(element.scrollHeight > lineHeight * lines + 1);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [text, lines]);
  useEffect(() => { setExpanded(false); setMessage(''); }, [text]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setMessage('Full text copied.'); }
    catch { setMessage('Copy is unavailable. Select the text and copy it manually.'); }
  };
  return <div className={`min-w-0 ${className}`}>
    <p ref={paragraph} id={id} className={`readable-text ${expanded ? '' : 'expandable-text-clamped'}`} style={{ '--text-lines': lines }}>{text}</p>
    {(overflows || reader) && <div className="mt-3 flex flex-wrap items-center gap-2">
      {overflows && <button type="button" className="secondary-button h-9 text-xs" aria-expanded={expanded} aria-controls={id} onClick={() => { setExpanded(!expanded); if (expanded) paragraph.current?.scrollIntoView?.({ block: 'nearest' }); }}>{expanded ? 'Show less' : 'Show more'}</button>}
      {reader && <button type="button" className="secondary-button h-9 text-xs" onClick={() => setReading(true)}><Maximize2 size={14} />Read full text</button>}
      {reader && <span className="text-xs text-zinc-400">{text.length.toLocaleString()} characters</span>}
    </div>}
    <Dialog open={reading} title={label} wide onClose={() => setReading(false)} footer={<><button type="button" className="secondary-button" onClick={copy}><Copy size={15} />Copy full text</button><button type="button" className="secondary-button" onClick={() => saveDownload({ blob: new Blob([text], { type: 'text/plain;charset=utf-8' }), filename: `${label.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}.txt` })}><Download size={15} />Download TXT</button><button type="button" className="primary-button" onClick={() => setReading(false)}>Done</button></>}>
      <p className="readable-text mx-auto max-w-[75ch] text-base">{text}</p>
      {message && <p className="mt-4 text-sm text-zinc-300" role="status">{message}</p>}
    </Dialog>
  </div>;
}
