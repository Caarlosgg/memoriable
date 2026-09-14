import * as Sentry from "@sentry/nextjs";
import { verifyBotSecret } from "@/lib/botAuth";
import { prisma } from "@/lib/prisma";
import { createPasswordResetToken } from "@/lib/passwordReset";
import { resolveBaseUrl, sendTelegramAccountSetupEmail } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Dominio de los emails sintéticos que crea `resolveOrCreateChatOwner` en el bot. */
const TELEGRAM_EMAIL_DOMAIN = "@telegram.memoriable.local";

interface SetEmailBody {
  userId?: string;
  email?: string;
}

/**
 * Puerta de entrada del comando `/email` del bot: quien empezó a usar
 * MemorIAble solo por Telegram (cuenta auto-provisionada, ver
 * `resolveOrCreateChatOwner`) pide aquí un correo real para poder entrar
 * también desde el dashboard web, sin perder nada de lo que ya tiene
 * guardado — es la MISMA cuenta, solo gana una puerta de entrada más.
 *
 * Mismo criterio de autenticación que `/api/bot/asistente`: secreto
 * compartido, no cookie (quien llama es el bot, no un navegador).
 */
export async function POST(req: Request) {
  if (!verifyBotSecret(req)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: SetEmailBody;
  try {
    body = (await req.json()) as SetEmailBody;
  } catch {
    return Response.json({ error: "Petición no válida." }, { status: 400 });
  }

  const userId = body.userId?.trim();
  const email = body.email?.trim().toLowerCase();
  if (!userId || !email) {
    return Response.json({ error: "Faltan datos en la petición." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "Ese correo no parece válido." }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, telegramChatId: true },
    });
    // Defensa en profundidad, mismo criterio que /api/bot/asistente: el
    // secreto compartido solo demuestra que quien llama es el bot, no que
    // este userId en concreto viene de verdad de Telegram. Sin
    // telegramChatId, esto no es una cuenta auto-provisionada — no tiene
    // sentido dejarle cambiarse el correo por este camino.
    if (!user || user.telegramChatId === null) {
      return Response.json({ error: "Esa cuenta no viene de Telegram." }, { status: 404 });
    }
    if (!user.email.endsWith(TELEGRAM_EMAIL_DOMAIN)) {
      return Response.json(
        { error: "Esta cuenta ya tiene un correo propio. Si no puedes entrar, usa «olvidé mi contraseña» en el dashboard." },
        { status: 409 },
      );
    }

    const enUso = await prisma.user.findUnique({ where: { email } });
    if (enUso) {
      return Response.json(
        { error: "Ya hay una cuenta con ese correo. Si es tuya, vincula este chat a ella con /vincular en vez de con /email." },
        { status: 409 },
      );
    }

    // `emailVerified: true` ya al guardar el correo, no al hacer clic:
    // completar /restablecer-password exige haber recibido y abierto el
    // enlace en ESTA bandeja de entrada, que ya es la prueba de que es
    // suya — mismo criterio que la cuenta corporativa creada por un
    // compañero de equipo (ver `addMemberByEmail`, equipo/actions.ts).
    await prisma.user.update({ where: { id: userId }, data: { email, emailVerified: true } });

    const setupToken = await createPasswordResetToken(userId);
    const baseUrl = await resolveBaseUrl();
    const enviado = await sendTelegramAccountSetupEmail(email, `${baseUrl}/restablecer-password?token=${setupToken}`);
    return Response.json({ ok: true, enviado });
  } catch (err) {
    console.error("No se pudo guardar el correo de una cuenta de Telegram:", err);
    Sentry.captureException(err);
    return Response.json({ error: "No se ha podido guardar el correo. Inténtalo de nuevo." }, { status: 500 });
  }
}
