import { env } from '../config/env.js';
import type { Category } from '../ai/types.js';
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
  // de compilación hasta ejecutar `prisma generate`. Incluye $executeRaw
  // porque la columna `embedding` es `Unsupported("vector(768)")` — Prisma
  // excluye los tipos Unsupported del cliente tipado por completo (ni
  // create ni findMany los tocan), así que es la única vía para leerla o
  // escribirla.
  private clientPromise: Promise<{
    message: {
      create(args: unknown): Promise<StoredMessage>;
      // `user` opcional y aparte de `StoredMessage`: solo `pending()` la
      // pide (con `include`), para saber el email de quien creó una tarea
      // asignada a otra persona — ver `asignadaPor` en repository.ts.
      findMany(args: unknown): Promise<(StoredMessage & { user?: { email: string } | null })[]>;
      findFirst(args: unknown): Promise<StoredMessage | null>;
      // `updateMany` (no `update`) para markDone/recategorize: el `where`
      // combina id + userId, que Prisma no acepta en `update` sin una
      // restricción única compuesta — así de paso el `count` devuelto sirve
      // para saber si el id era ajeno/inventado, sin una consulta aparte.
      updateMany(args: unknown): Promise<{ count: number }>;
    };
    user: {
      findUnique(args: unknown): Promise<{ personalWorkspaceId: string | null } | null>;
    };
    $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
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

  async save(userId: string, record: NewMessage): Promise<StoredMessage> {
    const client = await this.getClient();

    // Fase Equipo: todo mensaje vive en un workspace, nunca solo en un
    // userId — el bot no tiene concepto de equipo todavía, así que
    // siempre escribe en el workspace PERSONAL del dueño del chat. Cada
    // cuenta ya tiene uno (autocreado al registrarse desde el dashboard,
    // o backfillado por la migración para las cuentas previas) — si por
    // lo que sea faltara, es un estado inconsistente real, no algo que
    // deba silenciarse guardando con workspaceId nulo.
    const owner = await client.user.findUnique({ where: { id: userId }, select: { personalWorkspaceId: true } });
    if (!owner?.personalWorkspaceId) {
      throw new Error(
        `El usuario ${userId} no tiene workspace personal — no se puede guardar el mensaje.`,
      );
    }

    // Primero el insert normal (tipado, siempre fiable) y LUEGO, si hay
    // embedding, un UPDATE aparte para la columna Unsupported. Dos viajes en
    // vez de un INSERT crudo único: así el mensaje se guarda de forma
    // fiable aunque el paso del embedding falle (se trata como no crítico,
    // igual que un fallo del propio Embedder — ver ai/embedder.ts).
    const stored = await client.message.create({
      data: {
        tipo: record.tipo,
        contenido: record.contenido,
        categoria: record.categoria,
        resumen: record.resumen,
        userId,
        workspaceId: owner.personalWorkspaceId,
      },
    });

    if (record.embedding && record.embedding.length > 0) {
      await this.setEmbedding(client, stored.id, record.embedding);
    }

    return stored;
  }

  private async setEmbedding(
    client: Awaited<ReturnType<PrismaMessageRepository['getClient']>>,
    id: string,
    embedding: number[],
  ): Promise<void> {
    try {
      // pgvector espera el literal como texto ('[0.1,0.2,...]') casteado a
      // ::vector; Prisma parametriza el string y Postgres hace el cast.
      const literal = `[${embedding.join(',')}]`;
      await client.$executeRaw`UPDATE "messages" SET "embedding" = ${literal}::vector WHERE "id" = ${id}`;
    } catch {
      // No crítico: el mensaje ya está guardado: y el backfill (ver
      // src/cli/backfillEmbeddings.ts) puede rellenarlo más adelante.
    }
  }

  async search(userId: string, query: string, limit: number = DEFAULT_SEARCH_LIMIT): Promise<StoredMessage[]> {
    const needle = query.trim();
    if (needle === '') return [];
    const client = await this.getClient();
    // `contains` + `mode: 'insensitive'` compila a `ILIKE '%needle%'` en Postgres.
    // Coincidencia sobre contenido O resumen, los más recientes primero.
    return client.message.findMany({
      where: {
        userId,
        OR: [
          { contenido: { contains: needle, mode: 'insensitive' } },
          { resumen: { contains: needle, mode: 'insensitive' } },
        ],
      },
      orderBy: { fecha: 'desc' },
      take: Math.max(0, limit),
    });
  }

  async pending(userId: string, limit: number = DEFAULT_PENDING_LIMIT): Promise<StoredMessage[]> {
    const client = await this.getClient();
    // Pendientes = accionables (tarea/recordatorio) que aún no están hechos
    // Y, además de las propias, las que otra persona te ha ASIGNADO (Fase
    // Equipo) — antes solo se miraba `userId` (quien la creó), que nunca
    // cambia al asignar, así que una tarea asignada a ti por un compañero
    // no aparecía nunca en tu /pendientes de Telegram. El chequeo de
    // membresía ACTIVA evita que siga colándose una asignación de un
    // equipo del que ya saliste (mismo rigor que usa el dashboard).
    const rows = await client.message.findMany({
      where: {
        hecho: false,
        categoria: { in: [...ACTIONABLE_CATEGORIES] },
        OR: [
          { userId },
          { assigneeId: userId, workspace: { memberships: { some: { userId, status: 'ACTIVE' } } } },
        ],
      },
      include: { user: { select: { email: true } } },
      orderBy: { fecha: 'desc' },
      take: Math.max(0, limit),
    });
    // Solo se anota `asignadaPor` cuando NO es tuya — para una nota propia
    // sería ruido, no información (ver el comentario del campo en
    // repository.ts).
    return rows.map(({ user, ...m }) => ({
      ...m,
      asignadaPor: m.userId !== userId ? (user?.email ?? undefined) : undefined,
    }));
  }

  async savedBetween(userId: string, from: Date, to: Date): Promise<StoredMessage[]> {
    const client = await this.getClient();
    // Rango semiabierto [from, to): incluye el inicio, excluye el fin.
    return client.message.findMany({
      where: { userId, fecha: { gte: from, lt: to } },
      orderBy: { fecha: 'desc' },
    });
  }

  async markDone(userId: string, messageId: string): Promise<StoredMessage | null> {
    const client = await this.getClient();
    // `estado: 'HECHO'` junto con `hecho: true`, nunca uno sin el otro — ver
    // el comentario de `markDone` en repository.ts sobre por qué deben ir
    // sincronizados con el tablero kanban del dashboard.
    const { count } = await client.message.updateMany({
      where: { id: messageId, userId },
      data: { hecho: true, estado: 'HECHO' },
    });
    if (count === 0) return null;
    return client.message.findFirst({ where: { id: messageId, userId } });
  }

  async recategorize(userId: string, messageId: string, categoria: Category): Promise<StoredMessage | null> {
    const client = await this.getClient();
    const { count } = await client.message.updateMany({
      where: { id: messageId, userId },
      data: { categoria },
    });
    if (count === 0) return null;
    return client.message.findFirst({ where: { id: messageId, userId } });
  }
}
