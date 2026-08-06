"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import type { Recurrencia } from "@prisma/client";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

export interface EventoInput {
  titulo: string;
  descripcion?: string;
  /** ISO (de un `<input type="datetime-local">`, sin zona — se interpreta en hora local del navegador). */
  fechaInicio: string;
  fechaFin?: string;
  ubicacion?: string;
  participantes: string[];
  /** Calendario por periodos (Tier P4): repetición. `undefined`/vacío = evento suelto, sin repetir. */
  recurrencia?: Recurrencia;
  /** Última fecha (inclusive) hasta la que repetir. Solo tiene efecto si `recurrencia` está puesta. */
  recurrenciaHasta?: string;
}

export interface EventoResult {
  error?: string;
}

interface ParsedEvento {
  titulo: string;
  descripcion?: string;
  fechaInicio: Date;
  fechaFin: Date | null;
  ubicacion?: string;
  participantes: string[];
  recurrencia: Recurrencia | null;
  recurrenciaHasta: Date | null;
}

function parseEventoInput(input: EventoInput): { data: ParsedEvento } | { error: string } {
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

  let recurrenciaHasta: Date | null = null;
  if (input.recurrencia && input.recurrenciaHasta) {
    recurrenciaHasta = new Date(input.recurrenciaHasta);
    if (Number.isNaN(recurrenciaHasta.getTime())) return { error: "La fecha de fin de la repetición no es válida." };
    if (recurrenciaHasta < fechaInicio) {
      return { error: "La repetición no puede terminar antes de que empiece el evento." };
    }
  }

  return {
    data: {
      titulo,
      descripcion: input.descripcion?.trim() || undefined,
      fechaInicio,
      fechaFin,
      ubicacion: input.ubicacion?.trim() || undefined,
      participantes: input.participantes.map((p) => p.trim()).filter(Boolean),
      recurrencia: input.recurrencia ?? null,
      // Sin recurrencia, "hasta" no tiene sentido — se ignora aunque venga rellena.
      recurrenciaHasta: input.recurrencia ? recurrenciaHasta : null,
    },
  };
}

/** Crea un evento desde /calendario. Mismos criterios de validación que la tool crearEvento del Asistente. */
export async function createEvento(input: EventoInput): Promise<EventoResult> {
  const userId = await verifySession();
  const parsed = parseEventoInput(input);
  if ("error" in parsed) return { error: parsed.error };

  try {
    await prisma.evento.create({
      data: {
        userId,
        titulo: parsed.data.titulo,
        descripcion: parsed.data.descripcion ?? null,
        fechaInicio: parsed.data.fechaInicio,
        fechaFin: parsed.data.fechaFin,
        ubicacion: parsed.data.ubicacion ?? null,
        participantes: parsed.data.participantes,
        recurrencia: parsed.data.recurrencia,
        recurrenciaHasta: parsed.data.recurrenciaHasta,
      },
    });
    revalidatePath("/calendario");
    return {};
  } catch (err) {
    console.error("Error al crear el evento:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido guardar el evento. Inténtalo de nuevo." };
  }
}

/** Edita un evento. `updateMany` con userId en el where (mismo criterio de dueño que el resto de acciones). */
export async function updateEvento(id: string, input: EventoInput): Promise<EventoResult> {
  const userId = await verifySession();
  const parsed = parseEventoInput(input);
  if ("error" in parsed) return { error: parsed.error };

  try {
    const result = await prisma.evento.updateMany({
      where: { id, userId },
      data: {
        titulo: parsed.data.titulo,
        descripcion: parsed.data.descripcion ?? null,
        fechaInicio: parsed.data.fechaInicio,
        fechaFin: parsed.data.fechaFin,
        ubicacion: parsed.data.ubicacion ?? null,
        participantes: parsed.data.participantes,
        recurrencia: parsed.data.recurrencia,
        recurrenciaHasta: parsed.data.recurrenciaHasta,
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

/** Borra un evento. Mismo criterio de dueño: solo borra si pertenece al usuario de la sesión. */
export async function deleteEvento(id: string): Promise<EventoResult> {
  const userId = await verifySession();
  try {
    await prisma.evento.deleteMany({ where: { id, userId } });
    revalidatePath("/calendario");
    return {};
  } catch (err) {
    console.error("Error al borrar el evento:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido borrar. Inténtalo de nuevo." };
  }
}
