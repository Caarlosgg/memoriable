import "server-only";
import type { Message } from "@prisma/client";
import { prisma } from "./prisma";
import { ACTIONABLE_CATEGORIES, CATEGORIES, type Category } from "./categories";
import { hybridSearch } from "./hybridSearch";
import { findSimilarMessages } from "./vectorSearch";
import { resolveEmbedder } from "./pipeline";

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

/** Resultados devueltos por una búsqueda. */
const SEARCH_LIMIT = 15;

/**
 * Búsqueda de texto (ILIKE) sobre contenido o resumen, con filtro de
 * categoría opcional. Mismo comportamiento que el /buscar del bot,
 * reimplementado aquí porque el dashboard tiene su propio cliente de Prisma
 * (ver prisma/schema.prisma). Es la mitad "texto" de la búsqueda híbrida.
 */
async function textSearch(query: string, categoria: Category | null, limit: number): Promise<Message[]> {
  return prisma.message.findMany({
    where: {
      ...(categoria ? { categoria } : {}),
      OR: [
        { contenido: { contains: query, mode: "insensitive" } },
        { resumen: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { fecha: "desc" },
    take: Math.max(0, limit),
  });
}

/**
 * Búsqueda híbrida: texto exacto (ya probado) primero, similitud semántica
 * como complemento cuando el texto no llena el límite — nunca al revés. Ver
 * hybridSearch.ts para la política de mezcla exacta.
 */
export async function searchMessages(
  query: string,
  categoria: Category | null = null,
): Promise<Message[]> {
  const needle = query.trim();
  if (needle === "") return [];

  return hybridSearch(needle, categoria, SEARCH_LIMIT, {
    textSearch,
    embedder: resolveEmbedder(),
    findSimilar: findSimilarMessages,
  });
}

/**
 * Pendientes: tareas y recordatorios que aún no se han marcado como hechos,
 * los más recientes primero. Mismo criterio que /pendientes en el bot.
 */
export async function getPendingMessages(): Promise<Message[]> {
  return prisma.message.findMany({
    where: {
      hecho: false,
      categoria: { in: [...ACTIONABLE_CATEGORIES] },
    },
    orderBy: { fecha: "desc" },
  });
}
