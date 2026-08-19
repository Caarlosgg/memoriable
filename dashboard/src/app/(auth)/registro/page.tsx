import type { Metadata } from "next";
import { RegisterForm } from "./RegisterForm";
import { GoogleButton } from "../login/GoogleButton";
import { isGoogleOAuthConfigured } from "@/lib/googleOAuth";

export const metadata: Metadata = {
  title: "Crear cuenta · MemorIAble",
};

export default function RegisterPage() {
  return (
    <>
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">
        Crea tu cuenta
      </h1>
      <p className="mb-6 text-sm text-muted">
        Empiezas en tu espacio privado — solo tú lo ves. Más adelante puedes crear un equipo cuando lo
        necesites.
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
    </>
  );
}
