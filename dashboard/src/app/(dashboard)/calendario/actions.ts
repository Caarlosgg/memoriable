"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspace, isActiveMember } from "@/lib/workspace";
import { createNotification } from "@/lib/notifications";
import { fechaRepeticion, type Frecuencia } from "@/lib/calendar";

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
  const { workspaceId } = await getActiveWorkspace(userId);
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
  const { workspaceId } = await getActiveWorkspace(userId);
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
  const { workspaceId } = await getActiveWorkspace(userId);
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
  const { workspaceId } = await getActiveWorkspace(userId);

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
 * para que la notificación diga algo útil. Enlaza a /calendario a secas:
 * no hay (todavía) forma de enlazar directo a un evento concreto dentro
 * de la cuadrícula mensual.
 */
async function notifyEventoAssignment(assigneeId: string, eventoId: string): Promise<void> {
  const evento = await prisma.evento.findUnique({ where: { id: eventoId }, select: { titulo: true } });
  if (!evento) return;
  await createNotification({
    userId: assigneeId,
    type: "ASSIGNED_EVENTO",
    title: "Te han asignado un evento",
    body: evento.titulo,
    link: "/calendario",
  });
}
