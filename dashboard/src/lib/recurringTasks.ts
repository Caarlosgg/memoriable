import "server-only";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "./prisma";
import { refrescarEmbedding } from "./pipeline";
import { fechaRepeticion, type Frecuencia } from "./calendar";
import { checklistToArray } from "./checklist";

/**
 * Al completarse una tarea que pertenece a una serie recurrente (ver el
 * parámetro `repetir` de la tool `crearNota`, y `Message.serieId`), genera
 * la SIGUIENTE ocurrencia con la fecha desplazada.
 *
 * A diferencia de un evento recurrente (que materializa TODAS sus
 * ocurrencias de golpe al crearse, ver `crearEvento`), una tarea
 * recurrente solo tiene UNA fila "viva" a la vez: "sacar la basura" debe
 * reaparecer la semana que viene al completarla, no existir ya 52 veces
 * de golpe desde el primer día — así es como se espera que funcione un
 * recordatorio periódico de verdad.
 *
 * Se llama desde los CUATRO caminos que pueden marcar una tarea como
 * HECHA (`updateTaskStatus`/`moveTask`/`updateMessage` en actions.ts, y
 * `completarTarea` en assistantTools.ts) — vive aquí, no repetida cuatro
 * veces, para que los cuatro se comporten igual.
 *
 * Best-effort de verdad: la tarea YA quedó marcada como hecha cuando esto
 * corre. Un fallo aquí no debe deshacer eso — solo significa que la
 * siguiente ocurrencia no se generó sola esta vez (recuperable a mano
 * creando la nota de nuevo). Nunca lanza.
 */
export async function spawnSiguienteOcurrencia(messageId: string): Promise<void> {
  try {
    const tarea = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        serieId: true,
        serieFrecuencia: true,
        serieIndice: true,
        serieVeces: true,
        userId: true,
        workspaceId: true,
        tipo: true,
        contenido: true,
        categoria: true,
        customCategoryId: true,
        resumen: true,
        etiquetas: true,
        camposExtra: true,
        checklist: true,
        assigneeId: true,
        fechaLimite: true,
      },
    });
    if (
      !tarea?.serieId ||
      tarea.serieFrecuencia === null ||
      tarea.serieIndice === null ||
      tarea.serieVeces === null
    ) {
      return;
    }

    // La serie ya dio todas las vueltas que se pidieron (mismo tope 2-20
    // que `repetir` en crearEvento) — no se genera una más.
    const siguienteIndice = tarea.serieIndice + 1;
    if (siguienteIndice >= tarea.serieVeces) return;

    const base = tarea.fechaLimite ?? new Date();
    const siguienteFecha = fechaRepeticion(base, tarea.serieFrecuencia as Frecuencia, 1);

    // El checklist vuelve a empezar sin marcar: una tarea recurrente con
    // sub-pasos ("revisar el coche: aceite, frenos, neumáticos") debe
    // volver a pedirlos cada vez, no arrastrar los ticks de la anterior.
    const checklistReiniciado = checklistToArray(tarea.checklist).map((item) => ({ ...item, hecho: false }));

    const creada = await prisma.message.create({
      data: {
        userId: tarea.userId,
        workspaceId: tarea.workspaceId,
        tipo: tarea.tipo,
        contenido: tarea.contenido,
        categoria: tarea.categoria,
        customCategoryId: tarea.customCategoryId,
        resumen: tarea.resumen,
        etiquetas: tarea.etiquetas,
        camposExtra: tarea.camposExtra ?? {},
        checklist: checklistReiniciado,
        assigneeId: tarea.assigneeId,
        fechaLimite: siguienteFecha,
        serieId: tarea.serieId,
        serieFrecuencia: tarea.serieFrecuencia,
        serieIndice: siguienteIndice,
        serieVeces: tarea.serieVeces,
      },
    });

    // Mismo texto, así que no hace falta volver a categorizar/resumir con
    // Groq — solo el embedding (para que la búsqueda por significado
    // encuentre también esta ocurrencia nueva, no solo las anteriores).
    await refrescarEmbedding(creada.id, tarea.contenido);
  } catch (err) {
    console.error("No se pudo generar la siguiente ocurrencia de una tarea recurrente:", err);
    Sentry.captureException(err);
  }
}
