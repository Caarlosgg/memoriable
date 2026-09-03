"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { CircleCheck, CircleAlert, Loader2 } from "lucide-react";
import { confirmarEmail, type ConfirmarEmailState } from "./actions";
import { Button } from "@/components/ui/button";

const initialState: ConfirmarEmailState = {};

const ERRORES = {
  invalido: {
    titulo: "Enlace no válido",
    texto: "Este enlace de confirmación no existe o ya se usó. Pide uno nuevo desde la pantalla de entrar.",
  },
  caducado: {
    titulo: "Enlace caducado",
    texto:
      "Este enlace de confirmación ya no es válido (caducan a las 24h). Pide uno nuevo desde la pantalla de entrar.",
  },
} as const;

/**
 * Confirma la cuenta en cuanto se abre el enlace y entra sola.
 *
 * Se autoenvía al montar, pero es un formulario de verdad: sin JavaScript el
 * botón sigue estando ahí y hace exactamente lo mismo con un clic. Ese botón
 * es también la razón de que el auto-envío sea seguro frente a los escáneres
 * de correo — ellos hacen GET, no ejecutan JS ni envían formularios (ver el
 * comentario de `confirmarEmail`).
 */
export function ConfirmarForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(confirmarEmail, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const yaEnviado = useRef(false);

  useEffect(() => {
    // El guard evita el doble envío del StrictMode en desarrollo, que
    // gastaría el token de un solo uso contra sí mismo.
    if (yaEnviado.current || !token) return;
    yaEnviado.current = true;
    formRef.current?.requestSubmit();
  }, [token]);

  // Si sale bien no se llega a renderizar nada: la acción redirige a /.
  const error = state.status && state.status !== "ok" ? ERRORES[state.status] : null;

  if (error) {
    return (
      <>
        <CircleAlert aria-hidden size={32} className="mx-auto mb-3 text-danger" />
        <h1 className="mb-1 font-display text-xl font-semibold text-ink">{error.titulo}</h1>
        <p className="mb-6 text-sm text-muted">{error.texto}</p>
        <Link href="/login" className="font-medium text-accent hover:text-accent-strong">
          Ir a entrar
        </Link>
      </>
    );
  }

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="token" value={token} />
      {pending ? (
        <Loader2 aria-hidden size={32} className="mx-auto mb-3 animate-spin text-accent motion-reduce:animate-none" />
      ) : (
        <CircleCheck aria-hidden size={32} className="mx-auto mb-3 text-accent" />
      )}
      <h1 className="mb-1 font-display text-xl font-semibold text-ink">
        {pending ? "Activando tu cuenta…" : "Ya casi está"}
      </h1>
      <p className="mb-6 text-sm text-muted">
        {pending ? "Un segundo, te llevamos dentro." : "Confirma tu cuenta para entrar."}
      </p>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Entrando…" : "Confirmar cuenta y entrar"}
      </Button>
    </form>
  );
}
