export function PendingSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, col) => (
        <div key={col} className="flex flex-1 flex-col gap-3 rounded-2xl border border-paper-line p-3">
          <div className="skeleton h-5 w-24" />
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton h-20" style={{ animationDelay: `${(col * 2 + i) * 90}ms` }} />
          ))}
        </div>
      ))}
    </div>
  );
}
