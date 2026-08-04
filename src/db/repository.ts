import type { Analysis, IncomingMessage } from '../ai/types.js';
import { searchMessages } from './search.js';
import { pendingMessages } from './pending.js';

/** Registro tal como queda persistido (incluye id y fecha). */
export interface StoredMessage extends IncomingMessage, Analysis {
  id: string;
  /** ¿Marcado como hecho? Nace en `false` (pendiente). */
  hecho: boolean;
  fecha: Date;
  /** Dueño de la nota (Fase 2, multiusuario). Ver MessageRepository. */
  userId: string;
  /**
   * Vector de embedding, si se generó al guardar (ver ai/embedder.ts).
   * `undefined`/`null` es un estado válido y frecuente: sin GEMINI_API_KEY,
   * o pendiente de backfill. No forma parte de lo que se muestra al usuario.
   */
  embedding?: number[] | null;
}

/** Datos necesarios para crear un registro (sin id/fecha, que los pone el store). */
export type NewMessage = IncomingMessage & Analysis & { embedding?: number[] | null };

/**
 * Contrato de persistencia. El pipeline depende de esta interfaz, no de Prisma,
 * para poder inyectar una implementación en memoria en tests y simulaciones.
 *
 * Todas las operaciones reciben `userId` (Fase 2, multiusuario): cada cuenta
 * ve solo sus propias notas. El llamante es responsable de haber resuelto
 * ya un usuario real antes de llegar aquí (el bot no guarda/busca/lista nada
 * de un chat de Telegram sin vincular; el dashboard exige sesión).
 */
export interface MessageRepository {
  save(userId: string, record: NewMessage): Promise<StoredMessage>;
  /**
   * Busca mensajes cuyo contenido o resumen contengan `query` (coincidencia de
   * texto, case-insensitive), devolviendo los más recientes primero.
   */
  search(userId: string, query: string, limit?: number): Promise<StoredMessage[]>;
  /**
   * Devuelve los pendientes (tareas/recordatorios sin marcar como hechos), los
   * más recientes primero.
   */
  pending(userId: string, limit?: number): Promise<StoredMessage[]>;
  /**
   * Devuelve los mensajes guardados en el rango `[from, to)` (por `fecha`), los
   * más recientes primero. Lo usa el resumen diario para "lo de ayer".
   */
  savedBetween(userId: string, from: Date, to: Date): Promise<StoredMessage[]>;
}

/**
 * Implementación en memoria. Útil en tests y en el CLI de simulación cuando no
 * hay `DATABASE_URL`. Genera ids incrementales y guarda todo en un array.
 */
export class InMemoryMessageRepository implements MessageRepository {
  private readonly items: StoredMessage[] = [];
  private seq = 0;

  async save(userId: string, record: NewMessage): Promise<StoredMessage> {
    const stored: StoredMessage = {
      ...record,
      id: `mem_${++this.seq}`,
      hecho: false,
      fecha: new Date(),
      userId,
    };
    this.items.push(stored);
    return stored;
  }

  async search(userId: string, query: string, limit?: number): Promise<StoredMessage[]> {
    return searchMessages(this.forUser(userId), query, limit);
  }

  async pending(userId: string, limit?: number): Promise<StoredMessage[]> {
    return pendingMessages(this.forUser(userId), limit);
  }

  async savedBetween(userId: string, from: Date, to: Date): Promise<StoredMessage[]> {
    return this.forUser(userId)
      .filter((m) => m.fecha.getTime() >= from.getTime() && m.fecha.getTime() < to.getTime())
      .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  }

  private forUser(userId: string): StoredMessage[] {
    return this.items.filter((m) => m.userId === userId);
  }

  /** Devuelve una copia de todos los registros guardados (solo para inspección). */
  all(): StoredMessage[] {
    return [...this.items];
  }
}
