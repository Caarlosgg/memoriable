export function CategoriesSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
      aria-hidden="true"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
          <div className="flex flex-col gap-3">
            {Array.from({ length: 2 }).map((_, j) => (
              <div
                key={j}
                className="h-20 animate-pulse rounded-xl bg-slate-100"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
