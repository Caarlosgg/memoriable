import { PrismaClient } from "@prisma/client";

// Cliente generado a partir del schema compartido en ../prisma/schema.prisma
// (generador `dashboardClient`, ver comentario allí). Mismo modelo y
// migraciones que el bot; esta app solo lee/actualiza, nunca migra.
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
