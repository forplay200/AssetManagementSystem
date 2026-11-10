import { useEffect, useId, useRef, useState } from 'react';

// The panel contains ordinary buttons and follows the page's Tab order.
export default function AssetActionPopover({ label, ariaLabel, className, disabled, alignLeft = false, children }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const dismissOutside = event => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <div ref={root} className={alignLeft ? 'relative min-w-0' : 'lg:relative'}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={event => {
        if (open && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}>
      <button ref={trigger} type="button" className={className} disabled={disabled}
        aria-label={ariaLabel} aria-expanded={open} aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(value => !value)}>
        {label}
      </button>
      {open && <div id={panelId} className={`absolute top-full z-20 mt-2 grid gap-1 rounded-lg border border-white/10 bg-aether-surface p-2 shadow-xl ${alignLeft ? 'left-0 w-64 max-w-[calc(100vw-3rem)]' : 'inset-x-0 lg:left-auto lg:right-0 lg:w-64'}`}>
        {children(close)}
      </div>}
    </div>
  );
}
