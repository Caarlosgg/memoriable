"use client";

import { useActionState, useRef } from "react";
import { KeyRound } from "lucide-react";
import { changePassword, type ChangePasswordResult } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const initialState: ChangePasswordResult = {};

/** Formulario de cambiar/añadir contraseña con sesión ya abierta — distinto del flujo de "olvidé mi contraseña" (ver actions.ts). */
export function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);

  const action = async (_prev: ChangePasswordResult, formData: FormData): Promise<ChangePasswordResult> => {
    const result = await changePassword(
      String(formData.get("currentPassword") ?? ""),
      String(formData.get("newPassword") ?? ""),
      String(formData.get("newPasswordConfirm") ?? ""),
    );
    if (result.ok) formRef.current?.reset();
    return result;
  };
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div className="rounded-2xl border border-paper-line bg-paper-raised p-5">
      <p className="mb-1 flex items-center gap-1.5 font-display text-lg text-ink">
        <KeyRound aria-hidden size={17} className="text-muted" />
        Contraseña
      </p>
      <p className="mb-3 text-sm text-muted">
        {hasPassword
          ? "Cambia la contraseña de tu cuenta."
          : "Tu cuenta usa solo Google para entrar. Puedes añadir una contraseña para también poder entrar con email."}
      </p>
      <form ref={formRef} action={formAction} className="flex flex-col gap-3" noValidate>
        {hasPassword && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="currentPassword" className="text-sm font-medium text-ink">
              Contraseña actual
            </label>
            <Input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="newPassword" className="text-sm font-medium text-ink">
            {hasPassword ? "Contraseña nueva" : "Contraseña"}
          </label>
          <Input id="newPassword" name="newPassword" type="password" required minLength={8} autoComplete="new-password" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="newPasswordConfirm" className="text-sm font-medium text-ink">
            Confirmar
          </label>
          <Input
            id="newPasswordConfirm"
            name="newPasswordConfirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        {state.ok && <p className="text-sm text-accent-strong">Contraseña actualizada.</p>}

        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? "Guardando…" : hasPassword ? "Cambiar contraseña" : "Añadir contraseña"}
        </Button>
      </form>
    </div>
  );
}
