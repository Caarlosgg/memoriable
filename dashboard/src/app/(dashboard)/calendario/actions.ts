"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspace, isActiveMember, canWrite, READONLY_ROLE_MESSAGE } from "@/lib/workspace";
import { createNotification } from "@/lib/notifications";
import { fechaRepeticion, type Frecuencia } from "@/lib/calendar";
import { getEventosEnRango, getTasksEnRango } from "@/lib/eventos";
import type { Evento, Message } from "@prisma/client";

export interface RepetirInput {
  frecuencia: Frecuencia;
  veces: number;
}

export interface EventoInput {
  titulo: string;
  descripcion?: string;
  /** ISO (de un `<input type="datetime-local">`, sin zona — se interpreta en hora local del navegador). */
  fechaInicio: string;
  fechaFin?: string;
  ubicacion?: string;
  participantes: string[];
  /** Solo en creación (ver createEvento) — crea toda la serie de una vez, mismo criterio que la tool crearEvento del Asistente. */
  repetir?: RepetirInput;
}

export interface EventoResult {
  error?: string;
}

function parseEventoInput(input: EventoInput): { data: Omit<EventoInput, "fechaInicio" | "fechaFin"> & { fechaInicio: Date; fechaFin: Date | null } } | { error: string } {
  const titulo = input.titulo.trim();
  if (!titulo) return { error: "Escribe un título." };

  const fechaInicio = new Date(input.fechaInicio);
  if (Number.isNaN(fechaInicio.getTime())) return { error: "La fecha de inicio no es válida." };

  let fechaFin: Date | null = null;
  if (input.fechaFin) {
    fechaFin = new Date(input.fechaFin);
    if (Number.isNaN(fechaFin.getTime())) return { error: "La fecha de fin no es válida." };
    if (fechaFin < fechaInicio) return { error: "La fecha de fin no puede ser antes que la de inicio." };
  }

  return {
    data: {
      titulo,
      descripcion: input.descripcion?.trim() || undefined,
      fechaInicio,
      fechaFin,
      ubicacion: input.ubicacion?.trim() || undefined,
      participantes: input.participantes.map((p) => p.trim()).filter(Boolean),
      repetir: input.repetir,
    },
  };
}

/**
 * Crea un evento desde /calendario. Mismos criterios de validación que la
 * tool crearEvento del Asistente — y el mismo `repetir` (una sola llamada
 * crea toda la serie, no hay que repetir el formulario a mano N veces).
 */
export async function createEvento(input: EventoInput): Promise<EventoResult> {
  const userId = await verifySession();
  const { workspaceId, role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) return { error: READONLY_ROLE_MESSAGE };
  const parsed = parseEventoInput(input);
  if ("error" in parsed) return { error: parsed.error };

  const repetir = parsed.data.repetir;
  const repeticiones = repetir?.veces ?? 1;

  try {
    // Secuencial (no Promise.all): mismo motivo que en assistantTools.ts —
    // pocas filas, sin ráfaga simultánea contra el pool de PgBouncer.
    for (let i = 0; i < repeticiones; i++) {
      await prisma.evento.create({
        data: {
          userId,
          workspaceId,
          titulo: parsed.data.titulo,
          descripcion: parsed.data.descripcion ?? null,
          fechaInicio: repetir ? fechaRepeticion(parsed.data.fechaInicio, repetir.frecuencia, i) : parsed.data.fechaInicio,
          fechaFin: parsed.data.fechaFin
            ? repetir
              ? fechaRepeticion(parsed.data.fechaFin, repetir.frecuencia, i)
              : parsed.data.fechaFin
            : null,
          ubicacion: parsed.data.ubicacion ?? null,
          participantes: parsed.data.participantes,
        },
      });
    }
    revalidatePath("/calendario");
    return {};
  } catch (err) {
    console.error("Error al crear el evento:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido guardar el evento. Inténtalo de nuevo." };
  }
}

/** Edita un evento. `updateMany` con workspaceId en el where (mismo criterio de acceso que el resto de acciones). */
export async function updateEvento(id: string, input: EventoInput): Promise<EventoResult> {
  const userId = await verifySession();
  const { workspaceId, role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) return { error: READONLY_ROLE_MESSAGE };
  const parsed = parseEventoInput(input);
  if ("error" in parsed) return { error: parsed.error };

  try {
    const result = await prisma.evento.updateMany({
      where: { id, workspaceId },
      data: {
        titulo: parsed.data.titulo,
        descripcion: parsed.data.descripcion ?? null,
        fechaInicio: parsed.data.fechaInicio,
        fechaFin: parsed.data.fechaFin,
        ubicacion: parsed.data.ubicacion ?? null,
        participantes: parsed.data.participantes,
      },
    });
    if (result.count === 0) return { error: "No se ha encontrado el evento." };
    revalidatePath("/calendario");
    return {};
  } catch (err) {
    console.error("Error al editar el evento:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido guardar. Inténtalo de nuevo." };
  }
}

/** Borra un evento. Mismo criterio de acceso: solo borra si pertenece al workspace activo. */
export async function deleteEvento(id: string): Promise<EventoResult> {
  const userId = await verifySession();
  const { workspaceId, role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) return { error: READONLY_ROLE_MESSAGE };
  try {
    await prisma.evento.deleteMany({ where: { id, workspaceId } });
    revalidatePath("/calendario");
    return {};
  } catch (err) {
    console.error("Error al borrar el evento:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido borrar. Inténtalo de nuevo." };
  }
}

/**
 * Asigna (o quita, con `assigneeId: null`) un evento a un miembro del
 * workspace activo. Mismo criterio que `assignMessage` en actions.ts:
 * `assigneeId` debe ser siempre un miembro ACTIVE del MISMO workspace.
 */
export async function assignEvento(id: string, assigneeId: string | null): Promise<EventoResult> {
  const userId = await verifySession();
  const { workspaceId, role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) return { error: READONLY_ROLE_MESSAGE };

  if (assigneeId && !(await isActiveMember(assigneeId, workspaceId))) {
    return { error: "Esa persona no es miembro de este workspace." };
  }

  try {
    const result = await prisma.evento.updateMany({ where: { id, workspaceId }, data: { assigneeId } });
    if (result.count === 0) return { error: "No se ha encontrado el evento." };
    revalidatePath("/calendario");

    if (assigneeId && assigneeId !== userId) {
      notifyEventoAssignment(assigneeId, id).catch((err) => {
        console.error("No se pudo crear la notificación de asignación (no crítico):", err);
      });
    }

    return {};
  } catch (err) {
    console.error("Error al asignar el evento:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido asignar. Inténtalo de nuevo." };
  }
}

/**
 * Notifica a quien se le ha asignado un evento — busca el título real
 * para que la notificación diga algo útil. `?evento=ID` en el enlace:
 * `calendario/page.tsx` lo lee para abrir automáticamente el detalle de
 * ese evento en vez de dejar solo la cuadrícula mensual general.
 */
async function notifyEventoAssignment(assigneeId: string, eventoId: string): Promise<void> {
  const evento = await prisma.evento.findUnique({ where: { id: eventoId }, select: { titulo: true } });
  if (!evento) return;
  await createNotification({
    userId: assigneeId,
    type: "ASSIGNED_EVENTO",
    title: "Te han asignado un evento",
    body: evento.titulo,
    link: `/calendario?evento=${eventoId}`,
  });
}

/**
 * Carga eventos y tareas de un rango concreto — la usa el calendario
 * cuando navegas fuera de los meses que ya trajo la página (ver
 * `rangoCalendario` en lib/eventos.ts). Antes se traían TODOS los eventos
 * del workspace en cada carga; con un año de uso eso son miles de filas
 * que casi nunca se miran.
 *
 * Las fechas viajan como ISO (una Server Action serializa `Date` sin
 * problema, pero el cliente las tiene ya como cadena y así no hay que
 * reconstruirlas dos veces).
 */
export async function loadCalendarRange(
  desdeIso: string,
  hastaIso: string,
): Promise<{ eventos: Evento[]; tareas: Message[] }> {
  const userId = await verifySession();
  const { workspaceId } = await getActiveWorkspace(userId);
  const desde = new Date(desdeIso);
  const hasta = new Date(hastaIso);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    return { eventos: [], tareas: [] };
  }

  try {
    const [eventos, tareas] = await Promise.all([
      getEventosEnRango(workspaceId, desde, hasta),
      getTasksEnRango(workspaceId, desde, hasta),
    ]);
    return { eventos, tareas };
  } catch (err) {
    // No crítico: el calendario ya tiene pintado lo que trajo la página,
    // así que se queda como está en vez de romperse.
    console.error("No se pudo cargar ese tramo del calendario:", err);
    Sentry.captureException(err);
    return { eventos: [], tareas: [] };
  }
}

/**
 * Mueve un evento a otro día conservando su hora y su duración — lo que
 * significa arrastrarlo en el calendario.
 *
 * Acción propia y no `updateEvento` con todos los campos: arrastrar solo
 * cambia CUÁNDO. Reenviar título, descripción y participantes desde el
 * cliente para mover una tarjeta es mandar de vuelta datos que no han
 * cambiado, y abre la puerta a pisarlos con una copia vieja si alguien los
 * editó entre que se pintó la pantalla y se soltó el ratón.
 *
 * `dias` puede ser negativo (mover hacia atrás). La duración se conserva
 * desplazando también `fechaFin` — un evento de dos horas sigue durando dos
 * horas al cambiarlo de día.
 */
export async function moverEvento(id: string, dias: number): Promise<EventoResult> {
  const userId = await verifySession();
  const { workspaceId, role } = await getActiveWorkspace(userId);
  if (!canWrite(role)) return { error: READONLY_ROLE_MESSAGE };

  if (!Number.isInteger(dias) || dias === 0) return { error: "Movimiento no válido." };
  // Tope de cordura: el desplazamiento lo calcula el cliente a partir de
  // dónde se soltó, y un valor absurdo (por un bug de arrastre) mandaría un
  // evento a otro siglo sin que nadie lo pidiera.
  if (Math.abs(dias) > 366) return { error: "Ese movimiento es demasiado grande." };

  try {
    const evento = await prisma.evento.findFirst({
      where: { id, workspaceId },
      select: { fechaInicio: true, fechaFin: true },
    });
    if (!evento) return { error: "No se ha encontrado el evento." };

    const desplazar = (fecha: Date) => {
      const nueva = new Date(fecha);
      nueva.setUTCDate(nueva.getUTCDate() + dias);
      return nueva;
    };

    await prisma.evento.updateMany({
      where: { id, workspaceId },
      data: {
        fechaInicio: desplazar(evento.fechaInicio),
        ...(evento.fechaFin ? { fechaFin: desplazar(evento.fechaFin) } : {}),
      },
    });

    revalidatePath("/calendario");
    return {};
  } catch (err) {
    console.error("Error al mover el evento:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido mover el evento. Inténtalo de nuevo." };
  }
}
