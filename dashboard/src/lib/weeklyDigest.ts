import "server-only";
import { prisma } from "./prisma";
import { resolveAmbientStats } from "./assistantAmbient";
import { sendWeeklyDigestEmail } from "./email";

/**
 * Resumen semanal por correo: "cuánto has guardado, qué vence pronto" —
 * un correo pasivo que no depende de que abras la app, pensado para
 * volver a traer de vuelta a quien se ha ido olvidando de ella. Pensado
 * para llamarse una vez a la semana desde el cron (ver
 * api/cron/resumen-semanal).
 *
 * Alcance: solo el espacio PERSONAL de cada usuario, mismo criterio que
 * la API pública (v1/notas) y el servidor MCP — el resumen de un equipo
 * tendría que decidir a quién avisar y de qué parte, y no hay un caso
 * real todavía que lo pida.
 *
 * Mismo dominio sintético que usa el bot para las cuentas
 * auto-provisionadas por Telegram (ver TELEGRAM_EMAIL_DOMAIN en
 * src/db/users.ts, en el otro proyecto — no se puede importar de ahí,
 * así que se repite aquí): mandarles un correo de verdad no tiene
 * sentido, esa dirección no existe.
 */
const TELEGRAM_EMAIL_DOMAIN = "@telegram.memoriable.local";

const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

export interface ResultadoResumenSemanal {
  elegibles: number;
  enviados: number;
}

export async function enviarResumenSemanal(baseUrl: string, ahora: Date = new Date()): Promise<ResultadoResumenSemanal> {
  const usuarios = await prisma.user.findMany({
    where: {
      weeklyDigestEmail: true,
      emailVerified: true,
      email: { not: { endsWith: TELEGRAM_EMAIL_DOMAIN } },
      personalWorkspaceId: { not: null },
    },
    select: { id: true, email: true, personalWorkspaceId: true },
  });

  const haceUnaSemana = new Date(ahora.getTime() - SEMANA_MS);
  let enviados = 0;

  for (const user of usuarios) {
    if (!user.personalWorkspaceId) continue;
    try {
      const [stats, notasNuevas] = await Promise.all([
        resolveAmbientStats(user.personalWorkspaceId),
        prisma.message.count({ where: { workspaceId: user.personalWorkspaceId, fecha: { gte: haceUnaSemana } } }),
      ]);

      // Sin nada que contar, mejor no mandar nada — un correo semanal
      // vacío es justo el tipo de ruido que enseña a ignorar el resto.
      if (notasNuevas === 0 && stats.pendientesCount === 0 && stats.eventosProximosCount === 0) continue;

      const enviado = await sendWeeklyDigestEmail(user.email, { ...stats, notasNuevas, url: `${baseUrl}/inicio` });
      if (enviado) enviados++;
    } catch (err) {
      // Un fallo con un usuario (email raro, Gemini/Gmail caído) no puede
      // dejar sin resumen al resto de la lista.
      console.error(`No se pudo mandar el resumen semanal a ${user.id}:`, err);
    }
  }

  return { elegibles: usuarios.length, enviados };
}
