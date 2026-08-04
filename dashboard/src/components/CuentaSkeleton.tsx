export function CuentaSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="skeleton h-4 w-24" />
      <div className="rounded-2xl border border-paper-line bg-paper-raised p-5">
        <div className="skeleton mb-2 h-3 w-12" />
        <div className="skeleton h-6 w-48" />
      </div>
      <div className="rounded-2xl border border-paper-line bg-paper-raised p-5">
        <div className="skeleton mb-3 h-6 w-24" />
        <div className="skeleton h-9 w-56" />
      </div>
    </div>
  );
}
