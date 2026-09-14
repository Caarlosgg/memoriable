import "server-only";
import { headers } from "next/headers";
import * as Sentry from "@sentry/nextjs";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Inicialización perezosa, mismo patrón que resolveEmbedder/resolveCategorizer
 * del bot: sin GMAIL_USER/GMAIL_APP_PASSWORD, el registro sigue funcionando
 * (la cuenta se crea igual), solo que no se envía el correo de verificación
 * — no debe romper nada por faltar variables opcionales.
 *
 * Gmail SMTP en vez de un proveedor transaccional (Resend/SendGrid): para
 * enviar a destinatarios arbitrarios de forma fiable, esos proveedores
 * exigen verificar un dominio propio (con sus registros DNS) — algo que
 * este proyecto no tiene y que tendría coste. Gmail con una "contraseña de
 * aplicación" no necesita dominio: el correo sale de verdad desde la propia
 * cuenta de Gmail del usuario, así que llega a la bandeja de entrada sin
 * más configuración.
 */
let cachedTransporter: Transporter | null | undefined;

function resolveTransporter(): Transporter | null {
  if (cachedTransporter !== undefined) return cachedTransporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  cachedTransporter =
    user && pass
      ? nodemailer.createTransport({ service: "gmail", auth: { user, pass } })
      : null;
  return cachedTransporter;
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

/**
 * Envía el correo de verificación al registrarse. Devuelve si se pudo
 * enviar — el registro NO falla si esto devuelve false (ver registro/
 * actions.ts): la cuenta ya está creada, y siempre queda la opción de
 * reenviar el correo desde /login.
 */
export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<boolean> {
  const transporter = resolveTransporter();
  if (!transporter) {
    console.error("GMAIL_USER/GMAIL_APP_PASSWORD no configuradas: no se envió el correo de verificación a", to);
    return false;
  }

  try {
    await transporter.sendMail({
      from: `MemorIAble <${process.env.GMAIL_USER}>`,
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
    return true;
  } catch (err) {
    console.error("Fallo al enviar el correo de verificación:", err);
    Sentry.captureException(err);
    return false;
  }
}

/**
 * Envía el correo de "restablecer contraseña". Mismo criterio que
 * sendVerificationEmail: devuelve si se pudo enviar de verdad, sin lanzar
 * — quien llama (requestPasswordReset) decide qué hacer si falla, pero
 * nunca revela al usuario si la cuenta existía (ver actions.ts).
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  const transporter = resolveTransporter();
  if (!transporter) {
    console.error("GMAIL_USER/GMAIL_APP_PASSWORD no configuradas: no se envió el correo de restablecer contraseña a", to);
    return false;
  }

  try {
    await transporter.sendMail({
      from: `MemorIAble <${process.env.GMAIL_USER}>`,
      to,
      subject: "Restablece tu contraseña en MemorIAble",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1c1b18;">
          <p style="font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #157a5f;">MemorIAble</p>
          <h1 style="font-size: 20px; margin: 8px 0 16px;">Restablece tu contraseña</h1>
          <p style="font-size: 14px; line-height: 1.5;">Hemos recibido una petición para cambiar la contraseña de esta cuenta. Elige una nueva:</p>
          <p style="margin: 24px 0;">
            <a href="${resetUrl}" style="background: #157a5f; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">Elegir nueva contraseña</a>
          </p>
          <p style="font-size: 12px; color: #6b6a66;">Si no has pedido esto, puedes ignorar este correo: tu contraseña actual sigue siendo válida. El enlace caduca en 1 hora.</p>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error("Fallo al enviar el correo de restablecer contraseña:", err);
    Sentry.captureException(err);
    return false;
  }
}

/**
 * Envía el correo de "activa tu cuenta" — cuenta corporativa creada por un
 * owner/admin al añadir a alguien a un equipo por email cuando esa persona
 * TODAVÍA no tenía cuenta en MemorIAble (ver equipo/actions.ts). Reutiliza
 * el mismo enlace que "restablecer contraseña" (mismo token, misma
 * página): para quien lo recibe, "pon tu contraseña" es exactamente la
 * misma acción tanto si viene de olvidar una contraseña como de activar
 * una cuenta nueva — no hace falta una página aparte, solo un asunto y
 * texto distintos para que el correo tenga sentido en este contexto.
 */
export async function sendAccountSetupEmail(to: string, setupUrl: string, workspaceName: string): Promise<boolean> {
  const transporter = resolveTransporter();
  if (!transporter) {
    console.error("GMAIL_USER/GMAIL_APP_PASSWORD no configuradas: no se envió el correo de activar cuenta a", to);
    return false;
  }

  try {
    await transporter.sendMail({
      from: `MemorIAble <${process.env.GMAIL_USER}>`,
      to,
      subject: `Te han añadido al equipo "${workspaceName}" en MemorIAble`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1c1b18;">
          <p style="font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #157a5f;">MemorIAble</p>
          <h1 style="font-size: 20px; margin: 8px 0 16px;">Te han añadido a un equipo</h1>
          <p style="font-size: 14px; line-height: 1.5;">
            Te han creado una cuenta en MemorIAble para formar parte del equipo <strong>${workspaceName}</strong>.
            Elige una contraseña para activarla:
          </p>
          <p style="margin: 24px 0;">
            <a href="${setupUrl}" style="background: #157a5f; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">Activar mi cuenta</a>
          </p>
          <p style="font-size: 12px; color: #6b6a66;">El enlace caduca en 1 hora. Si crees que esto es un error, puedes ignorar este correo.</p>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error("Fallo al enviar el correo de activar cuenta:", err);
    Sentry.captureException(err);
    return false;
  }
}

/**
 * Correo de "activa tu acceso web" para quien ya usa el bot de Telegram
 * (cuenta auto-provisionada al primer mensaje, ver `resolveOrCreateChatOwner`
 * en el bot) y decide dar un correo real con `/email` para poder entrar
 * también desde el navegador. Mismo enlace y misma página que
 * `sendAccountSetupEmail` (un token de restablecer contraseña sirve para
 * las dos cosas), pero con un asunto y un texto que tienen sentido aquí:
 * a esta persona nadie la ha "añadido a un equipo", ha sido ella quien ha
 * pedido la cuenta web desde el propio chat.
 */
export async function sendTelegramAccountSetupEmail(to: string, setupUrl: string): Promise<boolean> {
  const transporter = resolveTransporter();
  if (!transporter) {
    console.error("GMAIL_USER/GMAIL_APP_PASSWORD no configuradas: no se envió el correo de activar acceso web a", to);
    return false;
  }

  try {
    await transporter.sendMail({
      from: `MemorIAble <${process.env.GMAIL_USER}>`,
      to,
      subject: "Activa tu acceso web a MemorIAble",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1c1b18;">
          <p style="font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #157a5f;">MemorIAble</p>
          <h1 style="font-size: 20px; margin: 8px 0 16px;">Ya casi puedes entrar desde el navegador</h1>
          <p style="font-size: 14px; line-height: 1.5;">
            Nos has pedido desde Telegram poder ver tus notas también en el dashboard web.
            Elige una contraseña para terminar de activarlo — lo que ya tienes guardado te estará esperando ahí:
          </p>
          <p style="margin: 24px 0;">
            <a href="${setupUrl}" style="background: #157a5f; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">Elegir mi contraseña</a>
          </p>
          <p style="font-size: 12px; color: #6b6a66;">El enlace caduca en 1 hora. Si no has sido tú, puedes ignorar este correo.</p>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error("Fallo al enviar el correo de activar acceso web:", err);
    Sentry.captureException(err);
    return false;
  }
}

export interface WeeklyDigestData {
  notasNuevas: number;
  pendientesCount: number;
  vencidasCount: number;
  eventosProximos: { titulo: string; fecha: string }[];
  /** A dónde lleva el botón — el espacio personal, siempre (ver el comentario en weeklyDigest.ts). */
  url: string;
}

/**
 * Correo pasivo semanal: "cuánto has guardado, qué vence pronto" — no
 * depende de que abras la app para saber cómo vas. Reutiliza las MISMAS
 * cifras que ya calcula `resolveAmbientStats` para el Asistente
 * (assistantAmbient.ts), no un cálculo nuevo aparte.
 */
export async function sendWeeklyDigestEmail(to: string, data: WeeklyDigestData): Promise<boolean> {
  const transporter = resolveTransporter();
  if (!transporter) {
    console.error("GMAIL_USER/GMAIL_APP_PASSWORD no configuradas: no se envió el resumen semanal a", to);
    return false;
  }

  const eventosHtml = data.eventosProximos.length
    ? `<ul style="padding-left: 18px; margin: 4px 0;">${data.eventosProximos
        .map((e) => `<li style="font-size: 14px; color: #1c1b18;">${e.titulo} — ${e.fecha}</li>`)
        .join("")}</ul>`
    : "";

  try {
    await transporter.sendMail({
      from: `MemorIAble <${process.env.GMAIL_USER}>`,
      to,
      subject: "Tu semana en MemorIAble",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1c1b18;">
          <p style="font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #157a5f;">MemorIAble</p>
          <h1 style="font-size: 20px; margin: 8px 0 16px;">Tu semana en claro</h1>
          <p style="font-size: 14px; line-height: 1.6;">
            ${data.notasNuevas > 0 ? `Guardaste ${data.notasNuevas} nota${data.notasNuevas === 1 ? "" : "s"} esta semana. ` : ""}
            Tienes ${data.pendientesCount} pendiente${data.pendientesCount === 1 ? "" : "s"}${data.vencidasCount > 0 ? `, ${data.vencidasCount} ya vencida${data.vencidasCount === 1 ? "" : "s"}` : ""}.
          </p>
          ${eventosHtml}
          <p style="margin: 24px 0;">
            <a href="${data.url}" style="background: #157a5f; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">Ver mi semana</a>
          </p>
          <p style="font-size: 12px; color: #6b6a66;">Puedes desactivar este correo desde Cuenta → Avisos.</p>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error("Fallo al enviar el resumen semanal:", err);
    Sentry.captureException(err);
    return false;
  }
}
