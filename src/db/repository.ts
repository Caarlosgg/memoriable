import type { Analysis, IncomingMessage } from '../ai/types.js';

/** Registro tal como queda persistido (incluye id y fecha). */
export interface StoredMessage extends IncomingMessage, Analysis {
  id: string;
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
      fecha: new Date(),
    };
    this.items.push(stored);
    return stored;
  }

  /** Devuelve una copia de todos los registros guardados (solo para inspección). */
  all(): StoredMessage[] {
    return [...this.items];
  }
}
