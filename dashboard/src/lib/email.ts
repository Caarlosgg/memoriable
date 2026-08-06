import "server-only";
import { headers } from "next/headers";
import * as Sentry from "@sentry/nextjs";
import { Resend } from "resend";

/**
 * Inicialización perezosa, mismo patrón que resolveEmbedder/resolveCategorizer
 * del bot: sin RESEND_API_KEY, el registro sigue funcionando (la cuenta se
 * crea igual), solo que no se envía el correo de verificación — no debe
 * romper nada por faltar una variable opcional.
 */
let cachedClient: Resend | null | undefined;

function resolveResend(): Resend | null {
  if (cachedClient !== undefined) return cachedClient;
  const apiKey = process.env.RESEND_API_KEY;
  cachedClient = apiKey ? new Resend(apiKey) : null;
  return cachedClient;
}

/**
 * Origen absoluto (https://dominio) a partir de las cabeceras de la propia
 * petición — funciona igual en local (http://localhost:3000) y en Vercel
 * (detrás de su proxy, ver x-forwarded-*) sin necesitar una variable de
 * entorno propia con la URL pública.
 */
export async function resolveBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const FROM_ADDRESS = "MemorIAble <onboarding@resend.dev>";

/**
 * Envía el correo de verificación al registrarse. Devuelve si se pudo
 * enviar — el registro NO falla si esto devuelve false (ver registro/
 * actions.ts): la cuenta ya está creada, y siempre queda la opción de
 * reenviar el correo desde /login.
 */
export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<boolean> {
  const resend = resolveResend();
  if (!resend) {
    console.error("RESEND_API_KEY no configurada: no se envió el correo de verificación a", to);
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: "Confirma tu email en MemorIAble",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1c1b18;">
          <p style="font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #157a5f;">MemorIAble</p>
          <h1 style="font-size: 20px; margin: 8px 0 16px;">Confirma tu email</h1>
          <p style="font-size: 14px; line-height: 1.5;">Para terminar de crear tu cuenta, confirma que este email es tuyo:</p>
          <p style="margin: 24px 0;">
            <a href="${verifyUrl}" style="background: #157a5f; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">Confirmar email</a>
          </p>
          <p style="font-size: 12px; color: #6b6a66;">Si no has creado esta cuenta, puedes ignorar este correo. El enlace caduca en 24 horas.</p>
        </div>
      `,
    });
    if (error) {
      console.error("Resend devolvió un error al enviar el correo de verificación:", error);
      Sentry.captureException(new Error(`Resend error: ${error.message}`));
      return false;
    }
    return true;
  } catch (err) {
    console.error("Fallo al enviar el correo de verificación:", err);
    Sentry.captureException(err);
    return false;
  }
}
