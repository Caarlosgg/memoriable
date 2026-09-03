import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import { GoogleButton } from "./GoogleButton";
import { isGoogleOAuthConfigured } from "@/lib/googleOAuth";

export const metadata: Metadata = {
  title: "Entrar · MemorIAble",
};

const OAUTH_ERRORS: Record<string, string> = {
  oauth: "No se ha podido entrar con Google. Inténtalo de nuevo.",
  oauth_email_no_verificado: "Tu cuenta de Google no tiene el email verificado.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; cuenta?: string }>;
}) {
  const { error, cuenta } = await searchParams;
  const oauthError = error ? (OAUTH_ERRORS[error] ?? OAUTH_ERRORS.oauth) : undefined;
  // Tras borrar la cuenta (ver eliminarMiCuenta) se acaba aquí. Sin este
  // aviso, la pantalla de entrar aparece sin más y no queda claro si el
  // borrado se hizo o si simplemente caducó la sesión.
  const cuentaEliminada = cuenta === "eliminada";

  return (
    <>
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">
        Tu memoria, siempre a mano
      </h1>
      <p className="mb-6 text-sm text-muted">
        Notas, tareas y calendario que se organizan solos — a tu manera, o compartidos con tu equipo.
      </p>
      {cuentaEliminada && (
        <p role="status" className="mb-4 rounded-lg border border-paper-line bg-paper p-3 text-sm text-muted">
          Tu cuenta se ha eliminado. Gracias por haberla usado.
        </p>
      )}
      {oauthError && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {oauthError}
        </p>
      )}
      {isGoogleOAuthConfigured() && (
        <>
          <GoogleButton />
          <div className="my-4 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-paper-line" />
            o con tu email
            <span className="h-px flex-1 bg-paper-line" />
          </div>
        </>
      )}
      <LoginForm />
    </>
  );
}
