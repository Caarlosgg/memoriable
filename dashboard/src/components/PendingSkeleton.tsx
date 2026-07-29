export function PendingSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="h-5 w-28 animate-pulse rounded bg-slate-200" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
