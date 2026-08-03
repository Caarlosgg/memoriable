import { verifySession } from "@/lib/dal";
import { logout } from "@/app/actions";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Comprobación "de verdad" (no solo la optimista de proxy.ts): si no hay
  // sesión válida, redirige a /login.
  await verifySession();

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-paper-line bg-paper-raised px-4 py-3 sm:px-6">
        <h1 className="font-display text-lg font-semibold tracking-tight text-ink">
          MemorIAble
        </h1>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-full px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Salir
          </button>
        </form>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6">
        {children}
      </main>
    </>
  );
}
