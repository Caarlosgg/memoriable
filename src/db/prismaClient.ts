import { env } from '../config/env.js';

let clientPromise: Promise<unknown> | null = null;

/**
 * Cliente de Prisma COMPARTIDO por todo el proceso — perezoso (import
 * dinámico), así que sin `DATABASE_URL` el resto del sistema sigue
 * importándose sin fallar en carga, igual que el resto de módulos
 * opcionales de este proyecto.
 *
 * Antes cada clase respaldada por Prisma (`PrismaMessageRepository`,
 * `PrismaEventRepository`, `PrismaBudgetStore`, `PrismaSummaryStateStore`)
 * creaba SU PROPIO `PrismaClient` — hasta 4 pools de conexión
 * independientes para un solo proceso (uno de ellos, encima, instanciado
 * dos veces: una para el categorizador, otra para el Daily Briefing). Sin
 * beneficio: es el mismo proceso hablando con la misma base de datos.
 * Contra un Postgres de plan gratuito con el número de conexiones
 * ajustado (el pooler de Supabase), multiplicar pools de sobra es lo
 * último que conviene, más aún corriendo en un host que puede arrancar
 * varias veces al día por dormirse entre peticiones (Render free tier).
 */
export async function getSharedPrismaClient<T>(): Promise<T> {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL no está definida: no se puede crear el cliente de Prisma.');
  }
  if (!clientPromise) {
    clientPromise = import('@prisma/client').then(
      (mod) => new (mod as unknown as { PrismaClient: new () => unknown }).PrismaClient(),
    );
  }
  return clientPromise as Promise<T>;
}
