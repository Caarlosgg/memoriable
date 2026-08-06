"use client";

import Link from "next/link";
import { useActionState } from "react";
import { register, type RegisterState } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const initialState: RegisterState = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(register, initialState);

  if (state?.registered) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-ink">
          Cuenta creada. Te hemos mandado un enlace de confirmación — revisa tu correo (y la carpeta de spam, por
          si acaso) para poder entrar.
        </p>
        <Link href="/login" className="font-medium text-accent hover:text-accent-strong">
          Ir a entrar
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
        <Input id="email" name="email" type="email" required autoFocus autoComplete="email" />
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
          minLength={8}
          autoComplete="new-password"
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? "register-error" : undefined}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="passwordConfirm" className="text-sm font-medium text-ink">
          Confirmar contraseña
        </label>
        <Input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? "register-error" : undefined}
        />
      </div>

      {state?.error && (
        <p id="register-error" role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="mt-2 shadow-[0_10px_24px_-12px_rgba(21,122,95,0.55)]">
        {pending ? "Creando cuenta…" : "Crear cuenta"}
      </Button>

      <p className="text-center text-sm text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-accent hover:text-accent-strong">
          Entra
        </Link>
      </p>
    </form>
  );
}
