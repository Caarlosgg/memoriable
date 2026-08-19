"use client";

import { useActionState } from "react";
import { resendVerification, type ResendVerificationState } from "@/app/(auth)/login/actions";
import { Button } from "./ui/button";

const initialResendState: ResendVerificationState = {};

/** Botón "reenviar correo de confirmación" — usado desde /login (cuenta sin verificar) y /registro (si el primer envío falló). */
export function ResendVerification({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(resendVerification, initialResendState);

  if (state?.sent) {
    return (
      <p className="text-sm text-accent-strong">
        Si esa cuenta existe, te hemos mandado un nuevo enlace de confirmación — revisa tu correo.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="email" value={email} />
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="secondary" disabled={pending || !email}>
        {pending ? "Enviando…" : "Reenviar correo de confirmación"}
      </Button>
    </form>
  );
}
