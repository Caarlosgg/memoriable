import type { ReactNode } from "react";

/**
 * Shell compartido de las cinco pantallas de autenticación (login, registro,
 * olvidé/restablecer contraseña, verificar email) — antes estaba COPIADO
 * literalmente en cada `page.tsx` (el `<main className="auth-background">`,
 * la tarjeta, la sombra, el eyebrow "MemorIAble"), así que un ajuste de
 * estilo aquí eran cinco ediciones idénticas o, más probable, cuatro
 * páginas que se quedaban desincronizadas de la quinta.
 *
 * Grupo de rutas `(auth)`: no cambia ninguna URL — `/login` sigue siendo
 * `/login`, `proxy.ts` compara `pathname`, no ruta de archivo — solo agrupa
 * el layout sin añadir un segmento a la URL.
 *
 * `max-w-md` (448px), no `max-w-sm` (384px) como antes: el registro con los
 * requisitos de contraseña desplegados iba apretado a 384px.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-background flex flex-1 items-center justify-center p-6">
      <div className="fade-in relative z-10 w-full max-w-md rounded-2xl border border-paper-line bg-paper-raised p-8 shadow-[0_20px_40px_-28px_rgba(28,27,24,0.35)]">
        <p className="mb-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-accent">MemorIAble</p>
        {children}
      </div>
    </main>
  );
}
