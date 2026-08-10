"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Mail } from "lucide-react";
import { requestPasswordReset, type RequestPasswordResetState } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const initialState: RequestPasswordResetState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  if (state?.sent) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <Mail aria-hidden size={32} className="text-accent" />
        <h2 className="font-display text-lg font-semibold text-ink">Revisa tu correo</h2>
        <p className="text-sm text-muted">
          Si existe una cuenta con ese email, te hemos mandado un enlace para elegir una contraseña nueva (mira
          también la carpeta de spam, por si acaso). El enlace caduca en 1 hora.
        </p>
        <Link href="/login" className="text-sm font-medium text-accent hover:text-accent-strong">
          Volver a entrar
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-ink">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? "forgot-password-error" : undefined}
        />
      </div>

      {state?.error && (
        <p id="forgot-password-error" role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="mt-2 shadow-[0_10px_24px_-12px_rgba(21,122,95,0.55)]">
        {pending ? "Enviando…" : "Mandar enlace"}
      </Button>

      <p className="text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-accent hover:text-accent-strong">
          Volver a entrar
        </Link>
      </p>
    </form>
  );
}
