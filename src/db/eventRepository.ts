import { env } from '../config/env.js';

/** Datos mínimos de un evento del calendario que necesita el resumen diario. */
export interface EventSummary {
  titulo: string;
  fechaInicio: Date;
}

/**
 * Contrato de lectura de eventos del calendario, aparte de
 * `MessageRepository`: el resumen diario los necesita, pero son un modelo
 * distinto (`Evento`, de la Fase I del dashboard) — no tiene sentido forzar
 * a la implementación en memoria de mensajes a saber nada de calendario.
 */
export interface EventRepository {
  /** Eventos cuyo inicio cae en el rango `[from, to)`, los más tempranos primero. */
  eventsBetween(userId: string, from: Date, to: Date): Promise<EventSummary[]>;
}

/** Implementación en memoria. Útil en tests y en la simulación sin base de datos. */
export class InMemoryEventRepository implements EventRepository {
  constructor(private readonly items: EventSummary[] = []) {}

  async eventsBetween(_userId: string, from: Date, to: Date): Promise<EventSummary[]> {
    return this.items
      .filter((e) => e.fechaInicio.getTime() >= from.getTime() && e.fechaInicio.getTime() < to.getTime())
      .sort((a, b) => a.fechaInicio.getTime() - b.fechaInicio.getTime());
  }
}

/**
 * Respaldada por Prisma, mismo criterio de import perezoso que
 * `PrismaMessageRepository`: si falta `DATABASE_URL` o el cliente no se ha
 * generado, el resto del sistema sigue importándose sin fallar en carga.
 */
export class PrismaEventRepository implements EventRepository {
  private clientPromise: Promise<{
    evento: { findMany(args: unknown): Promise<EventSummary[]> };
  }> | null = null;

  private async getClient() {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL no está definida: el repositorio de eventos no puede arrancar.');
    }
    if (!this.clientPromise) {
      this.clientPromise = import('@prisma/client').then(
        (mod) => new (mod as unknown as { PrismaClient: new () => never }).PrismaClient(),
      );
    }
    return this.clientPromise;
  }

  async eventsBetween(userId: string, from: Date, to: Date): Promise<EventSummary[]> {
    const client = await this.getClient();
    return client.evento.findMany({
      where: { userId, fechaInicio: { gte: from, lt: to } },
      orderBy: { fechaInicio: 'asc' },
      select: { titulo: true, fechaInicio: true },
    });
  }
}
