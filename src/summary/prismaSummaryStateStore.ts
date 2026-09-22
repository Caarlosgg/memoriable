import { env } from '../config/env.js';
import type { SummaryStateStore } from './summaryState.js';

const GLOBAL_KEY = '';

/**
 * Marca de "resumen diario ya enviado hoy" respaldada por PostgreSQL (tabla
 * `bot_daily_summary_state`, ver prisma/schema.prisma), para que sobreviva a
 * que un host de free tier (Render) reinicie el proceso o borre su disco
 * efímero — el fichero local (`FileSummaryStateStore`) no sobrevive a eso.
 *
 * Mismo criterio que `PrismaBudgetStore`: cliente perezoso, falla en
 * silencio (reportando por callback). En el peor caso se reenvía el resumen
 * una vez de más, que es preferible a tumbar el bot por un problema de base
 * de datos.
 */
export class PrismaSummaryStateStore implements SummaryStateStore {
  private clientPromise: Promise<{
    botDailySummaryState: {
      findUnique(args: unknown): Promise<{ lastSentDay: string } | null>;
      upsert(args: unknown): Promise<unknown>;
    };
  }> | null = null;

  constructor(private readonly onError: (err: unknown) => void = () => {}) {}

  private async getClient() {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL no está definida: PrismaSummaryStateStore no puede arrancar.');
    }
    if (!this.clientPromise) {
      this.clientPromise = import('@prisma/client').then(
        (mod) => new (mod as unknown as { PrismaClient: new () => never }).PrismaClient(),
      );
    }
    return this.clientPromise;
  }

  async lastSentDay(subject?: string): Promise<string | undefined> {
    try {
      const client = await this.getClient();
      const row = await client.botDailySummaryState.findUnique({
        where: { subject: subject ?? GLOBAL_KEY },
      });
      return row?.lastSentDay;
    } catch (err) {
      this.onError(err);
      return undefined;
    }
  }

  async markSent(day: string, subject?: string): Promise<void> {
    try {
      const client = await this.getClient();
      const key = subject ?? GLOBAL_KEY;
      await client.botDailySummaryState.upsert({
        where: { subject: key },
        create: { subject: key, lastSentDay: day },
        update: { lastSentDay: day },
      });
    } catch (err) {
      this.onError(err);
    }
  }
}
