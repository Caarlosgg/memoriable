import type { Analysis, IncomingMessage } from '../ai/types.js';
import { searchMessages } from './search.js';
import { pendingMessages } from './pending.js';

/** Registro tal como queda persistido (incluye id y fecha). */
export interface StoredMessage extends IncomingMessage, Analysis {
  id: string;
  /** ¿Marcado como hecho? Nace en `false` (pendiente). */
  hecho: boolean;
  fecha: Date;
}

/** Datos necesarios para crear un registro (sin id/fecha, que los pone el store). */
export type NewMessage = IncomingMessage & Analysis;

/**
 * Contrato de persistencia. El pipeline depende de esta interfaz, no de Prisma,
 * para poder inyectar una implementación en memoria en tests y simulaciones.
 */
export interface MessageRepository {
  save(record: NewMessage): Promise<StoredMessage>;
  /**
   * Busca mensajes cuyo contenido o resumen contengan `query` (coincidencia de
   * texto, case-insensitive), devolviendo los más recientes primero.
   */
  search(query: string, limit?: number): Promise<StoredMessage[]>;
  /**
   * Devuelve los pendientes (tareas/recordatorios sin marcar como hechos), los
   * más recientes primero.
   */
  pending(limit?: number): Promise<StoredMessage[]>;
  /**
   * Devuelve los mensajes guardados en el rango `[from, to)` (por `fecha`), los
   * más recientes primero. Lo usa el resumen diario para "lo de ayer".
   */
  savedBetween(from: Date, to: Date): Promise<StoredMessage[]>;
}

/**
 * Implementación en memoria. Útil en tests y en el CLI de simulación cuando no
 * hay `DATABASE_URL`. Genera ids incrementales y guarda todo en un array.
 */
export class InMemoryMessageRepository implements MessageRepository {
  private readonly items: StoredMessage[] = [];
  private seq = 0;

  async save(record: NewMessage): Promise<StoredMessage> {
    const stored: StoredMessage = {
      ...record,
      id: `mem_${++this.seq}`,
      hecho: false,
      fecha: new Date(),
    };
    this.items.push(stored);
    return stored;
  }

  async search(query: string, limit?: number): Promise<StoredMessage[]> {
    return searchMessages(this.items, query, limit);
  }

  async pending(limit?: number): Promise<StoredMessage[]> {
    return pendingMessages(this.items, limit);
  }

  async savedBetween(from: Date, to: Date): Promise<StoredMessage[]> {
    return this.items
      .filter((m) => m.fecha.getTime() >= from.getTime() && m.fecha.getTime() < to.getTime())
      .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  }

  /** Devuelve una copia de todos los registros guardados (solo para inspección). */
  all(): StoredMessage[] {
    return [...this.items];
  }
}
