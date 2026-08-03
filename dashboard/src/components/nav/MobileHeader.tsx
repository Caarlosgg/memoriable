import { logout } from "@/app/actions";

/** Cabecera solo-móvil: en desktop el título y "Salir" viven en el Sidebar. */
export function MobileHeader() {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-paper-line bg-paper-raised px-4 py-3 sm:hidden">
      <h1 className="font-display text-lg font-semibold tracking-tight text-ink">MemorIAble</h1>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-full px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Salir
        </button>
      </form>
    </header>
  );
}
