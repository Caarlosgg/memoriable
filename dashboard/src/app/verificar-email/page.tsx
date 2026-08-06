import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, CircleAlert } from "lucide-react";
import { verifyEmailToken } from "@/lib/verification";

export const metadata: Metadata = {
  title: "Confirmar email · MemorIAble",
};

const MESSAGES = {
  ok: { titulo: "Email confirmado", texto: "Tu cuenta ya está lista. Ya puedes entrar." },
  invalido: {
    titulo: "Enlace no válido",
    texto: "Este enlace de confirmación no existe o ya se usó. Pide uno nuevo desde la pantalla de entrar.",
  },
  caducado: {
    titulo: "Enlace caducado",
    texto: "Este enlace de confirmación ya no es válido (caducan a las 24h). Pide uno nuevo desde la pantalla de entrar.",
  },
} as const;

export default async function VerificarEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const resultado = token ? await verifyEmailToken(token) : "invalido";
  const { titulo, texto } = MESSAGES[resultado];

  return (
    <main className="auth-background flex flex-1 items-center justify-center p-6">
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-paper-line bg-paper-raised p-8 text-center shadow-[0_20px_40px_-28px_rgba(28,27,24,0.35)]">
        <p className="mb-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-accent">MemorIAble</p>
        {resultado === "ok" ? (
          <CircleCheck aria-hidden size={32} className="mx-auto mb-3 text-accent" />
        ) : (
          <CircleAlert aria-hidden size={32} className="mx-auto mb-3 text-danger" />
        )}
        <h1 className="mb-1 font-display text-xl font-semibold text-ink">{titulo}</h1>
        <p className="mb-6 text-sm text-muted">{texto}</p>
        <Link href="/login" className="font-medium text-accent hover:text-accent-strong">
          Ir a entrar
        </Link>
      </div>
    </main>
  );
}
