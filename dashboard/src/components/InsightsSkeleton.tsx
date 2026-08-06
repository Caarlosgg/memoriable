export function InsightsSkeleton() {
  return (
    <section aria-hidden="true" className="flex flex-col gap-4">
      <div className="skeleton h-4 w-32 rounded" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl sm:col-span-2" />
      </div>
    </section>
  );
}
