import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Bloque de carga. La clase `.skeleton` (shimmer, ver globals.css) ya
 * existía, pero cada pantalla montaba su propia composición a mano: había
 * cinco skeletons artesanales (`PendingSkeleton`, `NotesSkeleton`,
 * `CuentaSkeleton`, `InsightsSkeleton`, `CalendarSkeleton`) con alturas y
 * radios distintos para lo mismo.
 *
 * `aria-hidden` por defecto: un skeleton no aporta nada a un lector de
 * pantalla — lo que anuncia la carga es el `<Suspense>` de arriba.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("skeleton h-4 w-full rounded-md", className)} {...props} />;
}

/** Varias líneas de texto simulado, la última más corta — como cae un párrafo real. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={i === lines - 1 ? "w-3/5" : "w-full"} />
      ))}
    </div>
  );
}

/** Tarjeta completa en carga — la forma más repetida en las pantallas de listado. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("flex flex-col gap-3 rounded-xl border border-paper-line bg-paper-raised p-4", className)}
    >
      <Skeleton className="h-3 w-24" />
      <SkeletonText lines={2} />
    </div>
  );
}
