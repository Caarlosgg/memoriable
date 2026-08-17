"use client";

import { useActionState, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { changePassword, type ChangePasswordResult } from "./actions";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordRequirements } from "@/components/PasswordRequirements";
import { Button } from "@/components/ui/button";

const initialState: ChangePasswordResult = {};

/** Formulario de cambiar/añadir contraseña con sesión ya abierta — distinto del flujo de "olvidé mi contraseña" (ver actions.ts). */
export function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const noCoinciden = newPasswordConfirm.length > 0 && newPassword !== newPasswordConfirm;

  const action = async (_prev: ChangePasswordResult, formData: FormData): Promise<ChangePasswordResult> => {
    const result = await changePassword(
      String(formData.get("currentPassword") ?? ""),
      String(formData.get("newPassword") ?? ""),
      String(formData.get("newPasswordConfirm") ?? ""),
    );
    if (result.ok) {
      formRef.current?.reset();
      // `form.reset()` no toca el estado de React de los campos
      // controlados — sin esto, los valores volverían a aparecer.
      setNewPassword("");
      setNewPasswordConfirm("");
    }
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
            <PasswordInput id="currentPassword" name="currentPassword" required autoComplete="current-password" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="newPassword" className="text-sm font-medium text-ink">
            {hasPassword ? "Contraseña nueva" : "Contraseña"}
          </label>
          <PasswordInput
            id="newPassword"
            name="newPassword"
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <PasswordRequirements password={newPassword} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="newPasswordConfirm" className="text-sm font-medium text-ink">
            Confirmar
          </label>
          <PasswordInput
            id="newPasswordConfirm"
            name="newPasswordConfirm"
            required
            minLength={8}
            autoComplete="new-password"
            value={newPasswordConfirm}
            onChange={(e) => setNewPasswordConfirm(e.target.value)}
            aria-invalid={noCoinciden ? true : undefined}
            aria-describedby={noCoinciden ? "cuenta-mismatch" : undefined}
          />
          {noCoinciden && (
            <p id="cuenta-mismatch" className="text-xs text-danger">
              Las contraseñas no coinciden.
            </p>
          )}
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
