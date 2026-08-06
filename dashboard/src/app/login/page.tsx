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
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const oauthError = error ? (OAUTH_ERRORS[error] ?? OAUTH_ERRORS.oauth) : undefined;

  return (
    <main className="auth-background flex flex-1 items-center justify-center p-6">
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-paper-line bg-paper-raised p-8 shadow-[0_20px_40px_-28px_rgba(28,27,24,0.35)]">
        <p className="mb-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-accent">
          MemorIAble
        </p>
        <h1 className="mb-1 font-display text-2xl font-semibold text-ink">
          Tu memoria, siempre a mano
        </h1>
        <p className="mb-6 text-sm text-muted">
          Entra con tu cuenta para ver tus notas.
        </p>
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
      </div>
    </main>
  );
}
