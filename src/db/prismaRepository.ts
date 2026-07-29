import { env } from '../config/env.js';
import type { MessageRepository, NewMessage, StoredMessage } from './repository.js';
import { DEFAULT_SEARCH_LIMIT } from './search.js';
import { ACTIONABLE_CATEGORIES, DEFAULT_PENDING_LIMIT } from './pending.js';

/**
 * Repositorio respaldado por Prisma/PostgreSQL.
 *
 * El cliente de Prisma se importa e instancia de forma PEREZOSA (import
 * dinámico dentro de `getClient`). Así, si falta `DATABASE_URL` o el cliente de
 * Prisma aún no se ha generado, el resto del sistema (tests, simulación) puede
 * seguir importándose y ejecutándose sin fallar en carga.
 */
export class PrismaMessageRepository implements MessageRepository {
  // Tipado laxo a propósito: el cliente generado por Prisma no existe en tiempo
  // de compilación hasta ejecutar `prisma generate`.
  private clientPromise: Promise<{
    message: {
      create(args: unknown): Promise<StoredMessage>;
      findMany(args: unknown): Promise<StoredMessage[]>;
    };
  }> | null = null;

  private async getClient() {
    if (!env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL no está definida: el repositorio de Prisma no puede arrancar.',
      );
    }
    if (!this.clientPromise) {
      this.clientPromise = import('@prisma/client').then(
        (mod) => new (mod as unknown as { PrismaClient: new () => never }).PrismaClient(),
      );
    }
    return this.clientPromise;
  }

  async save(record: NewMessage): Promise<StoredMessage> {
    const client = await this.getClient();
    return client.message.create({
      data: {
        tipo: record.tipo,
        contenido: record.contenido,
        categoria: record.categoria,
        resumen: record.resumen,
      },
    });
  }

  async search(query: string, limit: number = DEFAULT_SEARCH_LIMIT): Promise<StoredMessage[]> {
    const needle = query.trim();
    if (needle === '') return [];
    const client = await this.getClient();
    // `contains` + `mode: 'insensitive'` compila a `ILIKE '%needle%'` en Postgres.
    // Coincidencia sobre contenido O resumen, los más recientes primero.
    return client.message.findMany({
      where: {
        OR: [
          { contenido: { contains: needle, mode: 'insensitive' } },
          { resumen: { contains: needle, mode: 'insensitive' } },
        ],
      },
      orderBy: { fecha: 'desc' },
      take: Math.max(0, limit),
    });
  }

  async pending(limit: number = DEFAULT_PENDING_LIMIT): Promise<StoredMessage[]> {
    const client = await this.getClient();
    // Pendientes = accionables (tarea/recordatorio) que aún no están hechos.
    return client.message.findMany({
      where: {
        hecho: false,
        categoria: { in: [...ACTIONABLE_CATEGORIES] },
      },
      orderBy: { fecha: 'desc' },
      take: Math.max(0, limit),
    });
  }

  async savedBetween(from: Date, to: Date): Promise<StoredMessage[]> {
    const client = await this.getClient();
    // Rango semiabierto [from, to): incluye el inicio, excluye el fin.
    return client.message.findMany({
      where: { fecha: { gte: from, lt: to } },
      orderBy: { fecha: 'desc' },
    });
  }
}
