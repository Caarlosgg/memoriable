"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Mail, CircleAlert } from "lucide-react";
import { register, type RegisterState } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ResendVerification } from "@/components/ResendVerification";

const initialState: RegisterState = {};

function RegisteredConfirmation({ email, emailSent }: { email: string; emailSent: boolean }) {
  if (!emailSent) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <CircleAlert aria-hidden size={32} className="text-danger" />
        <h2 className="font-display text-lg font-semibold text-ink">Cuenta creada, pero...</h2>
        <p className="text-sm text-muted">
          No hemos podido mandarte el correo de confirmación ahora mismo. Puedes pedir que se reenvíe:
        </p>
        <div className="w-full">
          <ResendVerification email={email} />
        </div>
        <Link href="/login" className="text-sm font-medium text-accent hover:text-accent-strong">
          Ir a entrar
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Mail aria-hidden size={32} className="text-accent" />
      <h2 className="font-display text-lg font-semibold text-ink">Revisa tu correo</h2>
      <p className="text-sm text-muted">
        Te hemos mandado un enlace de confirmación a <span className="font-medium text-ink">{email}</span>. Ábrelo
        para activar tu cuenta (mira también la carpeta de spam, por si acaso).
      </p>
      <ResendVerification email={email} />
      <Link href="/login" className="text-sm font-medium text-accent hover:text-accent-strong">
        Ya lo he confirmado, ir a entrar
      </Link>
    </div>
  );
}

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(register, initialState);
  const [email, setEmail] = useState("");

  if (state?.registered) {
    return <RegisteredConfirmation email={email} emailSent={state.emailSent ?? false} />;
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
