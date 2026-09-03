import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { isSessionActive } from "@/lib/sessionRevocation";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";
import { eventosToICS } from "@/lib/ics";

/**
 * Descarga el calendario del workspace activo como `.ics`.
 *
 * Es lo que hace que el calendario sirva fuera de la app: lo que capturas
 * por Telegram vivía solo aquí dentro, y nadie mantiene dos calendarios.
 *
 * Autenticación por COOKIE de sesión, no por token en la URL: un `.ics` con
 * token sería una URL suscribible desde Google Calendar (más cómodo), pero
 * también una URL que da acceso permanente a toda la agenda del equipo a
 * quien la tenga. Eso pide un sistema de tokens revocables — hasta
 * entonces, se descarga y se importa a mano.
 */
export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  if (!session || !(await isSessionActive(session.userId, session.issuedAt))) {
    return new Response("No autenticado", { status: 401 });
  }

  const { workspaceId } = await getActiveWorkspace(session.userId);
  const eventos = await prisma.evento.findMany({
    where: { workspaceId },
    orderBy: { fechaInicio: "asc" },
    select: {
      id: true,
      titulo: true,
      descripcion: true,
      ubicacion: true,
      fechaInicio: true,
      fechaFin: true,
    },
  });

  return new Response(eventosToICS(eventos), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="memoriable.ics"',
      // Nunca cacheado: la agenda cambia y un `.ics` viejo es peor que
      // ninguno — se importa creyendo que está al día.
      "Cache-Control": "no-store",
    },
  });
}
