import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const layers = [];
const background = new Map();
let originalOverflow = '';
const focusable = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

function updateModalLayers() {
  const active = layers[layers.length - 1];
  if (!active) {
    background.forEach(({ inert, hidden }, node) => {
      node.inert = inert;
      if (hidden === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', hidden);
    });
    background.clear();
    document.body.style.overflow = originalOverflow;
    return;
  }
  Array.from(document.body.children).forEach(node => {
    if (!background.has(node)) background.set(node, { inert: node.inert, hidden: node.getAttribute('aria-hidden') });
    node.inert = node !== active;
    if (node === active) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', 'true');
  });
  document.body.style.overflow = 'hidden';
}

export default function Dialog({ open, title, description, children, footer, onClose, busy = false, wide = false }) {
  const id = useId();
  const panel = useRef(null);
  const callbacks = useRef({ onClose, busy });
  callbacks.current = { onClose, busy };
  const host = useRef(null);
  if (!host.current && typeof document !== 'undefined') host.current = document.createElement('div');

  useEffect(() => {
    if (!open) return undefined;
    const container = host.current;
    const previousFocus = document.activeElement;
    if (!layers.length) originalOverflow = document.body.style.overflow;
    document.body.appendChild(container);
    layers.push(container);
    updateModalLayers();
    const elements = () => Array.from(panel.current?.querySelectorAll(focusable) || []).filter(node => !node.closest('[hidden]'));
    (panel.current?.querySelector('[data-autofocus]') || elements()[0] || panel.current)?.focus();
    const trap = (event) => {
      if (layers[layers.length - 1] !== container) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (!callbacks.current.busy) callbacks.current.onClose?.();
      }
      if (event.key === 'Tab') {
        const items = elements();
        const first = items[0]; const last = items[items.length - 1];
        if (!first) { event.preventDefault(); panel.current?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    const containFocus = event => {
      if (layers[layers.length - 1] === container && !container.contains(event.target)) (elements()[0] || panel.current)?.focus();
    };
    document.addEventListener('keydown', trap, true);
    document.addEventListener('focusin', containFocus);
    return () => {
      document.removeEventListener('keydown', trap, true);
      document.removeEventListener('focusin', containFocus);
      const index = layers.indexOf(container);
      if (index !== -1) layers.splice(index, 1);
      container.remove();
      updateModalLayers();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose?.(); }}>
      <section ref={panel} className={`dialog-panel ${wide ? 'dialog-panel-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined} aria-busy={busy || undefined} tabIndex={-1}>
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 p-5">
          <div className="min-w-0"><h2 id={`${id}-title`} className="break-words font-display text-xl font-semibold text-zinc-100">{title}</h2>{description && <p id={`${id}-description`} className="mt-3 whitespace-pre-line text-sm leading-6 text-zinc-300">{description}</p>}</div>
          <button type="button" className="icon-action shrink-0" disabled={busy} onClick={onClose} aria-label="Close dialog"><X size={17} /></button>
        </header>
        <div className="dialog-content">{children}</div>
        {footer && <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-white/10 p-5">{footer}</footer>}
      </section>
    </div>, host.current,
  );
}
