import "server-only";
import type { Message } from "@prisma/client";
import { prisma } from "./prisma";
import { ACTIONABLE_CATEGORIES, CATEGORIES, type Category } from "./categories";
import { ESTADOS_TABLERO } from "./kanban";
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
 *
 * `highlightId`: cuando el Asistente cita una nota (ver assistantContext.ts)
 * y el enlace trae ese id, hay que poder verla aunque no esté entre las
 * `RECENT_PER_CATEGORY` más recientes de su categoría — se trae aparte y se
 * antepone a su grupo si hiciera falta.
 */
export async function getCategoryGroups(userId: string, highlightId?: string): Promise<CategoryGroup[]> {
  const [counts, highlighted, ...messagesByCategory] = await Promise.all([
    prisma.message.groupBy({ by: ["categoria"], where: { userId }, _count: { _all: true } }),
    highlightId ? prisma.message.findUnique({ where: { id: highlightId, userId } }) : Promise.resolve(null),
    ...CATEGORIES.map((categoria) =>
      prisma.message.findMany({
        where: { categoria, userId },
        orderBy: { fecha: "desc" },
        take: RECENT_PER_CATEGORY,
      }),
    ),
  ]);

  const totalByCategory = new Map(
    counts.map((c) => [c.categoria, c._count._all]),
  );

  return CATEGORIES.map((categoria, i) => {
    const messages = messagesByCategory[i]!;
    const needsHighlight = highlighted?.categoria === categoria && !messages.some((m) => m.id === highlighted.id);
    return {
      categoria,
      total: totalByCategory.get(categoria) ?? 0,
      messages: needsHighlight ? [highlighted!, ...messages] : messages,
    };
  });
}

/** Resultados devueltos por una búsqueda. */
const SEARCH_LIMIT = 15;

/**
 * Búsqueda de texto (ILIKE) sobre contenido o resumen, con filtro de
 * categoría opcional. Mismo comportamiento que el /buscar del bot,
 * reimplementado aquí porque el dashboard tiene su propio cliente de Prisma
 * (ver prisma/schema.prisma). Es la mitad "texto" de la búsqueda híbrida.
 */
async function textSearch(
  userId: string,
  query: string,
  categoria: Category | null,
  limit: number,
): Promise<Message[]> {
  return prisma.message.findMany({
    where: {
      userId,
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
  userId: string,
  query: string,
  categoria: Category | null = null,
): Promise<Message[]> {
  const needle = query.trim();
  if (needle === "") return [];

  return hybridSearch(needle, categoria, SEARCH_LIMIT, {
    textSearch: (q, c, limit) => textSearch(userId, q, c, limit),
    embedder: resolveEmbedder(),
    findSimilar: (queryEmbedding, options) => findSimilarMessages(userId, queryEmbedding, options),
  });
}

export interface BoardColumn {
  estado: Message["estado"];
  messages: Message[];
}

/**
 * Tablero kanban (Fase 3): tareas y recordatorios agrupados por estado, los
 * más recientes primero dentro de cada columna. Mismo alcance que el viejo
 * "Pendientes" (categorías accionables) — solo que ahora también se ven las
 * ya hechas, en su propia columna, en vez de desaparecer sin más.
 */
export async function getBoardGroups(userId: string): Promise<BoardColumn[]> {
  const messages = await prisma.message.findMany({
    where: { userId, categoria: { in: [...ACTIONABLE_CATEGORIES] } },
    orderBy: { fecha: "desc" },
  });

  return ESTADOS_TABLERO.map((estado) => ({
    estado,
    messages: messages.filter((m) => m.estado === estado),
  }));
}
