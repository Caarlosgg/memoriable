import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** Enlace "volver" compacto — para secciones sin miga de pan propia (p. ej. las subpáginas de /admin), donde la única forma de retroceder era el botón del navegador. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="-mt-2 flex w-fit items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-accent-strong"
    >
      <ChevronLeft aria-hidden size={15} /> {label}
    </Link>
  );
}
