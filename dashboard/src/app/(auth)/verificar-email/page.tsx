import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { ConfirmarForm } from "./ConfirmarForm";

export const metadata: Metadata = {
  title: "Confirmar email · MemorIAble",
};

/**
 * Página del enlace del correo de confirmación.
 *
 * Ojo con lo que NO hace: no consume el token al renderizar. De eso se
 * encarga el Server Action (ver `actions.ts`) — es lo que permite iniciar
 * sesión de una vez, en lugar de mandar a /login a quien acaba de demostrar
 * quién es.
 */
export default async function VerificarEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    // La única de las cinco pantallas cuyo contenido va centrado entero
    // (es un status, no un formulario) — a diferencia del shell compartido
    // (ver (auth)/layout.tsx), esto es propio de esta página.
    <div className="text-center">
      {token ? (
        <ConfirmarForm token={token} />
      ) : (
        <>
          <CircleAlert aria-hidden size={32} className="mx-auto mb-3 text-danger" />
          <h1 className="mb-1 font-display text-xl font-semibold text-ink">Enlace no válido</h1>
          <p className="mb-6 text-sm text-muted">
            A este enlace le falta el código de confirmación. Pide uno nuevo desde la pantalla de
            entrar.
          </p>
          <Link href="/login" className="font-medium text-accent hover:text-accent-strong">
            Ir a entrar
          </Link>
        </>
      )}
    </div>
  );
}
