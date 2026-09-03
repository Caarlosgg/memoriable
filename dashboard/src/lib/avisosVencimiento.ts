import "server-only";
import { prisma } from "./prisma";
import { createNotification } from "./notifications";

/**
 * Recordatorios que de verdad recuerdan.
 *
 * El agujero nº1 del producto: se podía clasificar algo como
 * "recordatorio", ponerle fecha límite... y no pasaba absolutamente nada,
 * nunca. Toda la infraestructura estaba hecha (notificaciones en la campana,
 * push del navegador con VAPID configurado) y sin usar para lo único que
 * justifica llamarse recordatorio.
 */

/**
 * Con cuántos días de antelación se avisa. 1 = hoy y mañana.
 *
 * Deliberadamente corto: avisar de algo que vence en cinco días es ruido
 * que enseña a ignorar los avisos, y cuando de verdad venza mañana ya nadie
 * los mira. Lo que hay hoy y lo que hay mañana es lo que cabe en la cabeza.
 */
const DIAS_DE_ANTELACION = 1;

export interface ResultadoAvisos {
  /** Cuántas tareas vencían dentro de la ventana. */
  encontradas: number;
  /** Cuántos avisos se llegaron a crear (los ya avisados hoy no cuentan). */
  avisadas: number;
}

/**
 * Fin del día `hoy + dias`, en la zona del servidor.
 *
 * El corte va al FINAL del día y no al principio: una tarea "para mañana"
 * sigue estando a tiempo hasta que mañana acabe (mismo criterio que
 * `plazoAFecha` en el bot).
 */
export function limiteVentana(ahora: Date, dias = DIAS_DE_ANTELACION): Date {
  const limite = new Date(ahora);
  limite.setDate(limite.getDate() + dias);
  limite.setHours(23, 59, 59, 999);
  return limite;
}

/** Clave de día (YYYY-MM-DD) para no repetir el mismo aviso dos veces. */
export function claveDia(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

/** Cómo se redacta el plazo. Sin horas: para una fecha límite, el día es lo que importa. */
export function textoVencimiento(fechaLimite: Date, ahora: Date): string {
  const hoy = claveDia(ahora);
  const manana = claveDia(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1));
  const dia = claveDia(fechaLimite);

  if (dia < hoy) return "venció ya";
  if (dia === hoy) return "vence hoy";
  if (dia === manana) return "vence mañana";
  return `vence el ${fechaLimite.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}`;
}

/**
 * Crea los avisos de vencimiento que toquen. Pensado para llamarse una vez
 * al día desde el cron (ver `api/cron/avisos`).
 *
 * A quién se avisa: al ASIGNADO si lo hay, y si no a quien la creó. Avisar a
 * los dos duplicaría el aviso en el caso normal (te asignas tu propia
 * tarea), y avisar solo al autor dejaría sin enterarse justo a quien tiene
 * que hacerla.
 *
 * Idempotencia: el `link` de la notificación lleva la clave del día, así que
 * comprobar si ya existe una con ese mismo link evita duplicar el aviso si
 * el cron se dispara dos veces. Sin tabla ni columna nueva para eso — la
 * propia notificación ya guarda lo que hace falta saber.
 */
export async function enviarAvisosDeVencimiento(ahora: Date = new Date()): Promise<ResultadoAvisos> {
  const limite = limiteVentana(ahora);

  const tareas = await prisma.message.findMany({
    where: {
      hecho: false,
      fechaLimite: { not: null, lte: limite },
      // Solo lo accionable: una "idea" con fecha no es algo que venza.
      categoria: { in: ["tarea", "recordatorio"] },
    },
    select: {
      id: true,
      resumen: true,
      fechaLimite: true,
      userId: true,
      assigneeId: true,
      workspaceId: true,
    },
  });

  const dia = claveDia(ahora);
  let avisadas = 0;

  for (const tarea of tareas) {
    if (!tarea.fechaLimite) continue;
    // El asignado es quien tiene que hacerla; si no hay, quien la escribió.
    const destinatario = tarea.assigneeId ?? tarea.userId;
    const link = `/pendientes?mensaje=${tarea.id}&aviso=${dia}`;

    try {
      const yaAvisado = await prisma.notification.findFirst({
        where: { userId: destinatario, type: "DUE_SOON", link },
        select: { id: true },
      });
      if (yaAvisado) continue;

      await createNotification({
        userId: destinatario,
        type: "DUE_SOON",
        title: `Se acerca: ${tarea.resumen}`,
        body: textoVencimiento(tarea.fechaLimite, ahora),
        link,
      });
      avisadas++;
    } catch (err) {
      // Un fallo con una tarea (usuario borrado, push caído) no puede dejar
      // sin aviso a las siguientes de la lista.
      console.error(`No se pudo avisar del vencimiento de ${tarea.id}:`, err);
    }
  }

  return { encontradas: tareas.length, avisadas };
}
