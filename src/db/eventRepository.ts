import { getSharedPrismaClient } from './prismaClient.js';

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
 * Respaldada por Prisma — cliente COMPARTIDO por todo el proceso (ver
 * prismaClient.ts), así que sin `DATABASE_URL` el resto del sistema sigue
 * importándose sin fallar en carga.
 */
export class PrismaEventRepository implements EventRepository {
  private async getClient() {
    return getSharedPrismaClient<{
      evento: { findMany(args: unknown): Promise<EventSummary[]> };
    }>();
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
