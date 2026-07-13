export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="panel flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
      {Icon && <Icon size={28} className="mb-4 text-zinc-500" />}
      <h2 className="font-display text-lg font-semibold text-zinc-100">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-zinc-400">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
