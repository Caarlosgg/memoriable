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
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <h1 className="text-base font-semibold text-slate-900">Memoria IA</h1>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Salir
          </button>
        </form>
      </header>
      <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
    </>
  );
}
