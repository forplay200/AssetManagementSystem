export default function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 font-mono text-xs uppercase tracking-[0.16em] text-aether-primary">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-semibold leading-snug tracking-tight text-zinc-50 [overflow-wrap:anywhere] sm:text-[28px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-zinc-400">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
