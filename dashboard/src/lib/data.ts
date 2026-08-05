import "server-only";
import type { Message, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { ACTIONABLE_CATEGORIES, CATEGORIES, type Category } from "./categories";
import { ESTADOS_TABLERO } from "./kanban";
import { hybridSearch, type SearchFilters } from "./hybridSearch";
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

/** Traduce los filtros del buscador (Fase F) a un `where` de Prisma, reutilizado por texto y por conteo. */
function filtersToWhere(filters: SearchFilters): Prisma.MessageWhereInput {
  return {
    ...(filters.categoria ? { categoria: filters.categoria } : {}),
    ...(filters.estado ? { estado: filters.estado } : {}),
    ...(filters.prioridad ? { prioridad: filters.prioridad } : {}),
    ...(filters.desde || filters.hasta
      ? {
          fecha: {
            ...(filters.desde ? { gte: filters.desde } : {}),
            ...(filters.hasta ? { lte: filters.hasta } : {}),
          },
        }
      : {}),
  };
}

/**
 * Búsqueda de texto (ILIKE) sobre contenido o resumen, con filtros
 * opcionales (categoría/estado/prioridad/fechas, Fase F). Mismo
 * comportamiento que el /buscar del bot, reimplementado aquí porque el
 * dashboard tiene su propio cliente de Prisma (ver prisma/schema.prisma).
 * Es la mitad "texto" de la búsqueda híbrida.
 */
async function textSearch(
  userId: string,
  query: string,
  filters: SearchFilters,
  limit: number,
): Promise<Message[]> {
  return prisma.message.findMany({
    where: {
      userId,
      ...filtersToWhere(filters),
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
  filters: SearchFilters = {},
): Promise<Message[]> {
  const needle = query.trim();
  if (needle === "") return [];

  return hybridSearch(needle, filters, SEARCH_LIMIT, {
    textSearch: (q, f, limit) => textSearch(userId, q, f, limit),
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
