"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { login, type LoginState } from "./actions";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { ResendVerification } from "@/components/ResendVerification";

const initialState: LoginState = {};

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
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium text-ink">
            Contraseña
          </label>
          <Link href="/olvide-password" className="text-xs font-medium text-accent hover:text-accent-strong">
            ¿La olvidaste?
          </Link>
        </div>
        {/* Sin lista de requisitos a propósito: aquí se escribe una
            contraseña QUE YA EXISTE — enseñarle las reglas nuevas a quien
            solo quiere entrar (y cuya contraseña puede ser anterior a
            ellas) sería ruido y daría a entender que la suya ya no vale. */}
        <PasswordInput
          id="password"
          name="password"
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
