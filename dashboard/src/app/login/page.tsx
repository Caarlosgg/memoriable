import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Entrar · Memoria IA",
};

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Memoria IA</h1>
        <p className="mb-6 text-sm text-slate-500">
          Introduce la contraseña para ver tu dashboard.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
