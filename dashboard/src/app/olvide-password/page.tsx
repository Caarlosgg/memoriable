import type { Metadata } from "next";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Recuperar contraseña · MemorIAble",
};

export default function OlvidePasswordPage() {
  return (
    <main className="auth-background flex flex-1 items-center justify-center p-6">
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-paper-line bg-paper-raised p-8 shadow-[0_20px_40px_-28px_rgba(28,27,24,0.35)]">
        <p className="mb-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-accent">
          MemorIAble
        </p>
        <h1 className="mb-1 font-display text-2xl font-semibold text-ink">
          ¿Olvidaste tu contraseña?
        </h1>
        <p className="mb-6 text-sm text-muted">
          Escribe tu email y te mandamos un enlace para elegir una nueva.
        </p>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
