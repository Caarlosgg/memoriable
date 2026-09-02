import { env } from '../config/env.js';

/** Una categoría propia del usuario, tal como se pinta en el selector. */
export interface CustomCategory {
  id: string;
  nombre: string;
  emoji: string | null;
}

/**
 * Cliente de Prisma perezoso, mismo criterio que `PrismaMessageRepository`:
 * sin `DATABASE_URL`, el resto del bot (tests, simulación) sigue
 * funcionando — esto solo se usa al pintar el selector de "Recategorizar",
 * nunca en el camino caliente de guardar un mensaje.
 */
let clientPromise: Promise<{
  customCategory: {
    findMany(args: unknown): Promise<CustomCategory[]>;
    findFirst(args: unknown): Promise<CustomCategory | null>;
  };
}> | null = null;

async function getClient() {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL no está definida: no se pueden leer las categorías propias.');
  }
  if (!clientPromise) {
    clientPromise = import('@prisma/client').then(
      (mod) => new (mod as unknown as { PrismaClient: new () => never }).PrismaClient(),
    );
  }
  return clientPromise;
}

/**
 * Categorías propias del usuario, para añadir al selector de
 * "Recategorizar" junto a las 6 fijas (Fase 3 del roadmap: "categorías
 * configurables" — ver `Message.customCategoryId` en schema.prisma para
 * el diseño: es una etiqueta APARTE de la categoría fija, nunca la
 * sustituye). Nunca lanza: sin `DATABASE_URL`, o ante un fallo de red, el
 * selector simplemente se pinta solo con las fijas — no vale la pena
 * tumbar la respuesta del bot por esto.
 */
export async function listCustomCategories(userId: string): Promise<CustomCategory[]> {
  try {
    const client = await getClient();
    return await client.customCategory.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, nombre: true, emoji: true },
    });
  } catch {
    return [];
  }
}

/**
 * Una sola categoría propia, para pintar la línea extra en la tarjeta tras
 * marcar hecho/recategorizar/asignar una propia — evitar traer la lista
 * entera solo para encontrar una. `null` también sin `DATABASE_URL` o ante
 * un fallo (mismo criterio "no crítico" que `listCustomCategories`): la
 * tarjeta se enseña igual, solo sin esa línea.
 */
export async function findCustomCategory(userId: string, id: string): Promise<CustomCategory | null> {
  try {
    const client = await getClient();
    return await client.customCategory.findFirst({
      where: { id, userId },
      select: { id: true, nombre: true, emoji: true },
    });
  } catch {
    return null;
  }
}
