import { PrismaClient } from "@prisma/client";

// Cliente generado a partir de dashboard/prisma/schema.prisma (copia propia
// del schema del bot, ver comentario allí sobre por qué no se comparte).
// Mismo modelo que el bot; esta app solo lee/actualiza, nunca migra.
//
// Singleton en globalThis para no agotar el pool de conexiones con cada
// recarga en caliente de `next dev` (patrón recomendado por Prisma con
// Next.js).
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
