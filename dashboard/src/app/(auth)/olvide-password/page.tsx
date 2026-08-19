import type { Metadata } from "next";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Recuperar contraseña · MemorIAble",
};

export default function OlvidePasswordPage() {
  return (
    <>
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">
        ¿Olvidaste tu contraseña?
      </h1>
      <p className="mb-6 text-sm text-muted">
        Escribe tu email y te mandamos un enlace para elegir una nueva.
      </p>
      <ForgotPasswordForm />
    </>
  );
}
