import type { Metadata } from "next";
import { RegisterForm } from "./RegisterForm";
import { GoogleButton } from "../login/GoogleButton";
import { isGoogleOAuthConfigured } from "@/lib/googleOAuth";

export const metadata: Metadata = {
  title: "Crear cuenta · MemorIAble",
};

export default function RegisterPage() {
  return (
    <main className="auth-background flex flex-1 items-center justify-center p-6">
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-paper-line bg-paper-raised p-8 shadow-[0_20px_40px_-28px_rgba(28,27,24,0.35)]">
        <p className="mb-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-accent">
          MemorIAble
        </p>
        <h1 className="mb-1 font-display text-2xl font-semibold text-ink">
          Crea tu cuenta
        </h1>
        <p className="mb-6 text-sm text-muted">
          Tus notas son privadas: solo tú puedes verlas.
        </p>
        {isGoogleOAuthConfigured() && (
          <>
            {/* Mismo flujo que el botón de /login: con Google no hace falta
                confirmar email ni crear contraseña, la cuenta se crea sola
                al volver del callback si es la primera vez. */}
            <GoogleButton />
            <div className="my-4 flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-paper-line" />
              o con tu email
              <span className="h-px flex-1 bg-paper-line" />
            </div>
          </>
        )}
        <RegisterForm />
      </div>
    </main>
  );
}
