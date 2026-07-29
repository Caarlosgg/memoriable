import "server-only";
import type { Message } from "@prisma/client";
import { prisma } from "./prisma";
import { CATEGORIES, type Category } from "./categories";

/** Mensajes recientes que se muestran por categoría en la vista principal. */
const RECENT_PER_CATEGORY = 12;

export interface CategoryGroup {
  categoria: Category;
  total: number;
  messages: Message[];
}

/**
 * Agrupa los mensajes por categoría: el total real (para el contador) y los
 * más recientes (para no traer miles de filas de golpe). Una consulta de
 * conteo + una por categoría, en paralelo.
 */
export async function getCategoryGroups(): Promise<CategoryGroup[]> {
  const [counts, ...messagesByCategory] = await Promise.all([
    prisma.message.groupBy({ by: ["categoria"], _count: { _all: true } }),
    ...CATEGORIES.map((categoria) =>
      prisma.message.findMany({
        where: { categoria },
        orderBy: { fecha: "desc" },
        take: RECENT_PER_CATEGORY,
      }),
    ),
  ]);

  const totalByCategory = new Map(
    counts.map((c) => [c.categoria, c._count._all]),
  );

  return CATEGORIES.map((categoria, i) => ({
    categoria,
    total: totalByCategory.get(categoria) ?? 0,
    messages: messagesByCategory[i]!,
  }));
}
