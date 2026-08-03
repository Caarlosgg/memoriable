import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Entrar · MemorIAble",
};

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-paper-line bg-paper-raised p-8 shadow-[0_20px_40px_-28px_rgba(28,27,24,0.35)]">
        <p className="mb-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-accent">
          MemorIAble
        </p>
        <h1 className="mb-1 font-display text-2xl font-semibold text-ink">
          Tu memoria, siempre a mano
        </h1>
        <p className="mb-6 text-sm text-muted">
          Introduce la contraseña para ver tu dashboard.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
