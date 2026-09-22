import type { BudgetState, BudgetStore } from './budget.js';
import { getSharedPrismaClient } from '../db/prismaClient.js';

/** Clave del contador global (consumos que no son de ningún usuario concreto). */
const GLOBAL_KEY = '';

/**
 * Almacén del fusible respaldado por PostgreSQL (tabla `bot_budget_counter`,
 * ver prisma/schema.prisma), para que el contador sobreviva a que un host de
 * free tier (Render) reinicie el proceso o borre su disco efímero — el
 * fichero local (`FileBudgetStore`) no sobrevive a eso.
 *
 * Cliente COMPARTIDO por todo el proceso (ver db/prismaClient.ts), así que
 * sin `DATABASE_URL` el resto del sistema sigue importándose sin fallar en
 * carga. Falla en silencio en `load`/`save` (registrando vía callback
 * opcional): un problema de base de datos nunca debe tumbar el
 * procesamiento de un mensaje.
 */
export class PrismaBudgetStore implements BudgetStore {
  constructor(private readonly onError: (err: unknown) => void = () => {}) {}

  // Tipado laxo a propósito, igual que PrismaMessageRepository: el cliente
  // generado por Prisma no existe en tiempo de compilación hasta ejecutar
  // `prisma generate`.
  private async getClient() {
    return getSharedPrismaClient<{
      botBudgetCounter: {
        findUnique(args: unknown): Promise<BudgetState | null>;
        upsert(args: unknown): Promise<unknown>;
      };
    }>();
  }

  async load(subject?: string): Promise<BudgetState | null> {
    try {
      const client = await this.getClient();
      return await client.botBudgetCounter.findUnique({ where: { subject: subject ?? GLOBAL_KEY } });
    } catch (err) {
      this.onError(err);
      return null;
    }
  }

  async save(state: BudgetState, subject?: string): Promise<void> {
    try {
      const client = await this.getClient();
      const key = subject ?? GLOBAL_KEY;
      await client.botBudgetCounter.upsert({
        where: { subject: key },
        create: { subject: key, day: state.day, used: state.used },
        update: { day: state.day, used: state.used },
      });
    } catch (err) {
      this.onError(err);
    }
  }
}
