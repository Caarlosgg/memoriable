import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { checkPasswordResetToken } from "@/lib/passwordReset";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Restablecer contraseña · MemorIAble",
};

const ERROR_MESSAGES = {
  invalido: {
    titulo: "Enlace no válido",
    texto: "Este enlace para restablecer la contraseña no existe o ya se usó. Pide uno nuevo desde la pantalla de entrar.",
  },
  caducado: {
    titulo: "Enlace caducado",
    texto: "Este enlace ya no es válido (caducan a la hora de pedirlos). Pide uno nuevo desde la pantalla de entrar.",
  },
} as const;

export default async function RestablecerPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  // Comprobación de solo lectura: el token se consume de verdad (se borra)
  // al enviar el formulario, ver restablecer-password/actions.ts — así
  // recargar esta página con el mismo enlace no lo invalida por sí sola.
  const resultado = token ? await checkPasswordResetToken(token) : "invalido";

  return resultado === "ok" ? (
    <>
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">Elige una contraseña nueva</h1>
      <p className="mb-6 text-sm text-muted">Tras guardarla, entrarás directamente.</p>
      <ResetPasswordForm token={token!} />
    </>
  ) : (
    <div className="flex flex-col items-center gap-3 text-center">
      <CircleAlert aria-hidden size={32} className="text-danger" />
      <h1 className="font-display text-xl font-semibold text-ink">{ERROR_MESSAGES[resultado].titulo}</h1>
      <p className="text-sm text-muted">{ERROR_MESSAGES[resultado].texto}</p>
      <Link href="/olvide-password" className="font-medium text-accent hover:text-accent-strong">
        Pedir un enlace nuevo
      </Link>
    </div>
  );
}
