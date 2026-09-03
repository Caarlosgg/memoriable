"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Mail, CircleAlert } from "lucide-react";
import { register, type RegisterState } from "./actions";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordRequirements } from "@/components/PasswordRequirements";
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
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  // Aviso en vivo de que no coinciden, en vez de descubrirlo al enviar —
  // solo cuando ya ha escrito algo en la confirmación, para no marcar en
  // rojo un campo que aún está a medias.
  const noCoinciden = passwordConfirm.length > 0 && password !== passwordConfirm;

  if (state?.registered) {
    return <RegisteredConfirmation email={email} emailSent={state.emailSent ?? false} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {/* Primero el nombre: sin él, el primer avatar que ve el usuario —y el
          que ve su equipo— es su email troceado. Pedirlo aquí cuesta un
          campo; arreglarlo después no lo hace nadie. */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="nombre" className="text-sm font-medium text-ink">
          Nombre
        </label>
        <Input
          id="nombre"
          name="nombre"
          type="text"
          required
          autoFocus
          autoComplete="name"
          maxLength={60}
          placeholder="Cómo quieres que te llamemos"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
      </div>

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
          aria-invalid={state?.error ? true : undefined}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-ink">
          Contraseña
        </label>
        <PasswordInput
          id="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? "register-error" : undefined}
        />
        <PasswordRequirements password={password} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="passwordConfirm" className="text-sm font-medium text-ink">
          Confirmar contraseña
        </label>
        <PasswordInput
          id="passwordConfirm"
          name="passwordConfirm"
          required
          minLength={8}
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          aria-invalid={noCoinciden || state?.error ? true : undefined}
          aria-describedby={noCoinciden ? "register-mismatch" : state?.error ? "register-error" : undefined}
        />
        {noCoinciden && (
          <p id="register-mismatch" className="text-xs text-danger">
            Las contraseñas no coinciden.
          </p>
        )}
      </div>

      {/* Consentimiento explícito, sin premarcar y sin enterrarlo en letra
          pequeña bajo el botón: es lo que exige el RGPD y, además, los
          enlaces abren en pestaña nueva para no perder lo ya escrito. */}
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted">
        <input
          type="checkbox"
          name="acepta"
          value="si"
          required
          checked={acepta}
          onChange={(e) => setAcepta(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-sm accent-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        />
        <span>
          He leído y acepto los{" "}
          <Link
            href="/terminos"
            target="_blank"
            className="font-medium text-accent underline underline-offset-2 hover:text-accent-strong"
          >
            términos de uso
          </Link>{" "}
          y la{" "}
          <Link
            href="/privacidad"
            target="_blank"
            className="font-medium text-accent underline underline-offset-2 hover:text-accent-strong"
          >
            política de privacidad
          </Link>
          .
        </span>
      </label>

      {state?.error && (
        <p id="register-error" role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending || !acepta}
        className="mt-2 shadow-[0_10px_24px_-12px_rgba(21,122,95,0.55)]"
      >
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
