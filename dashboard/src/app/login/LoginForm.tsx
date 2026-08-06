"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { login, resendVerification, type LoginState, type ResendVerificationState } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const initialState: LoginState = {};
const initialResendState: ResendVerificationState = {};

function ResendVerification({ email }: { email: string }) {
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

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);
  const [email, setEmail] = useState("");

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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-ink">
          Contraseña
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? "login-error" : undefined}
        />
      </div>

      {state?.error && (
        <p id="login-error" role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="mt-2 shadow-[0_10px_24px_-12px_rgba(21,122,95,0.55)]">
        {pending ? "Entrando…" : "Entrar"}
      </Button>

      {state?.sinVerificar && <ResendVerification email={email} />}

      <p className="text-center text-sm text-muted">
        ¿No tienes cuenta?{" "}
        <Link href="/registro" className="font-medium text-accent hover:text-accent-strong">
          Crea una
        </Link>
      </p>
    </form>
  );
}
