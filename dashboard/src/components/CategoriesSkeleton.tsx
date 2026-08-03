export function CategoriesSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
      aria-hidden="true"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <div className="skeleton h-5 w-32" style={{ animationDelay: `${i * 60}ms` }} />
          <div className="flex flex-col gap-3">
            {Array.from({ length: 2 }).map((_, j) => (
              <div
                key={j}
                className="skeleton h-20"
                style={{ animationDelay: `${i * 60 + j * 90}ms` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
