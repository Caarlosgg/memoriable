"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPassword, type ResetPasswordState } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const initialState: ResetPasswordState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-ink">
          Nueva contraseña
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoFocus
          autoComplete="new-password"
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? "reset-password-error" : undefined}
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
          aria-describedby={state?.error ? "reset-password-error" : undefined}
        />
      </div>

      {state?.error && (
        <p id="reset-password-error" role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      {state?.tokenInvalido ? (
        <Link
          href="/olvide-password"
          className="text-center text-sm font-medium text-accent hover:text-accent-strong"
        >
          Pedir un enlace nuevo
        </Link>
      ) : (
        <Button type="submit" disabled={pending} className="mt-2 shadow-[0_10px_24px_-12px_rgba(21,122,95,0.55)]">
          {pending ? "Guardando…" : "Cambiar contraseña"}
        </Button>
      )}
    </form>
  );
}
