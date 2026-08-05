export function CalendarSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="skeleton h-40 rounded-2xl" />
      <div className="skeleton h-96 rounded-2xl" />
    </div>
  );
}
