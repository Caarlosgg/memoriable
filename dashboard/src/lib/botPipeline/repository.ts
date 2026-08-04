// Subconjunto sincronizado de ../../../../src/db/repository.ts: solo las
// interfaces (sin InMemoryMessageRepository, que el dashboard no usa). Ver
// botPipeline/README.md.

import type { Analysis, IncomingMessage } from './types';

/** Registro tal como queda persistido (incluye id y fecha). */
export interface StoredMessage extends IncomingMessage, Analysis {
  id: string;
  /** ¿Marcado como hecho? Nace en `false` (pendiente). */
  hecho: boolean;
  fecha: Date;
  /** Dueño de la nota (Fase 2, multiusuario). Ver MessageRepository. */
  userId: string;
  /** Vector de embedding, si se generó al guardar. Ver embedder.ts. */
  embedding?: number[] | null;
}

/** Datos necesarios para crear un registro (sin id/fecha, que los pone el store). */
export type NewMessage = IncomingMessage & Analysis & { embedding?: number[] | null };

/**
 * Contrato de persistencia. El pipeline depende de esta interfaz, no de
 * Prisma, para poder inyectar distintas implementaciones (bot, dashboard).
 *
 * Todas las operaciones reciben `userId` (Fase 2, multiusuario): cada
 * cuenta ve solo sus propias notas.
 */
export interface MessageRepository {
  save(userId: string, record: NewMessage): Promise<StoredMessage>;
  search(userId: string, query: string, limit?: number): Promise<StoredMessage[]>;
  pending(userId: string, limit?: number): Promise<StoredMessage[]>;
  savedBetween(userId: string, from: Date, to: Date): Promise<StoredMessage[]>;
}
