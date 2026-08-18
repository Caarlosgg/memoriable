import "server-only";
import type { Message, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { ACTIONABLE_CATEGORIES, CATEGORIES, type Category } from "./categories";
import { resolverColumnas, columnaDeTarjeta, type ColumnaTablero } from "./boardColumns";
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
 *
 * Fase Equipo: alcance por `workspaceId` (el activo), no por `userId` — ver
 * `lib/workspace.ts`.
 *
 * `hiddenCategories`: preferencia PERSONAL (Membership.hiddenCategories,
 * ver getHiddenCategories en lib/workspace.ts) — se quitan del resultado
 * antes de consultar, no solo de la vista, así que ni cuentan ni pesan.
 */
export async function getCategoryGroups(
  workspaceId: string,
  highlightId?: string,
  hiddenCategories: readonly string[] = [],
): Promise<CategoryGroup[]> {
  const visibleCategories = CATEGORIES.filter((c) => !hiddenCategories.includes(c));
  const [counts, highlighted, ...messagesByCategory] = await Promise.all([
    prisma.message.groupBy({ by: ["categoria"], where: { workspaceId }, _count: { _all: true } }),
    highlightId ? prisma.message.findUnique({ where: { id: highlightId, workspaceId } }) : Promise.resolve(null),
    ...visibleCategories.map((categoria) =>
      prisma.message.findMany({
        where: { categoria, workspaceId },
        orderBy: { fecha: "desc" },
        take: RECENT_PER_CATEGORY,
      }),
    ),
  ]);

  const totalByCategory = new Map(
    counts.map((c) => [c.categoria, c._count._all]),
  );

  return visibleCategories.map((categoria, i) => {
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
    ...(filters.etiqueta ? { etiquetas: { has: filters.etiqueta } } : {}),
  };
}

/**
 * Búsqueda de texto (ILIKE) sobre contenido o resumen, con filtros
 * opcionales (categoría/estado/prioridad/fechas, Fase F). Mismo
 * comportamiento que el /buscar del bot, reimplementado aquí porque el
 * dashboard tiene su propio cliente de Prisma (ver prisma/schema.prisma).
 * Es la mitad "texto" de la búsqueda híbrida. Alcance por `workspaceId`,
 * ver comentario de `searchMessages`.
 */
async function textSearch(
  workspaceId: string,
  query: string,
  filters: SearchFilters,
  limit: number,
): Promise<Message[]> {
  return prisma.message.findMany({
    where: {
      workspaceId,
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

function hasAnyFilter(filters: SearchFilters): boolean {
  return Boolean(
    filters.categoria || filters.estado || filters.prioridad || filters.desde || filters.hasta || filters.etiqueta,
  );
}

/**
 * Búsqueda híbrida: texto exacto (ya probado) primero, similitud semántica
 * como complemento cuando el texto no llena el límite — nunca al revés. Ver
 * hybridSearch.ts para la política de mezcla exacta.
 *
 * Sin texto (query vacía) pero con algún filtro puesto (Notas unificadas,
 * Fase K): se listan las notas que cumplen los filtros, más recientes
 * primero, sin ILIKE ni búsqueda semántica (no hay nada que "buscar",
 * solo que filtrar). Sin texto y sin filtros, no hay nada que pedir —
 * la vista agrupada por categoría ya cubre ese caso.
 *
 * Fase Equipo: alcance por `workspaceId` (el activo), no por `userId` —
 * texto y semántica deben coincidir en a qué tienes acceso; si uno se
 * quedara en `userId` y el otro pasara a `workspaceId`, la MISMA búsqueda
 * híbrida mostraría un alcance de visibilidad distinto según si una nota
 * coincide por texto o por embedding.
 */
export async function searchMessages(
  workspaceId: string,
  query: string,
  filters: SearchFilters = {},
): Promise<Message[]> {
  const needle = query.trim();

  if (needle === "") {
    if (!hasAnyFilter(filters)) return [];
    return prisma.message.findMany({
      where: { workspaceId, ...filtersToWhere(filters) },
      orderBy: { fecha: "desc" },
      take: SEARCH_LIMIT,
    });
  }

  return hybridSearch(needle, filters, SEARCH_LIMIT, {
    textSearch: (q, f, limit) => textSearch(workspaceId, q, f, limit),
    embedder: resolveEmbedder(),
    findSimilar: (queryEmbedding, options) => findSimilarMessages(workspaceId, queryEmbedding, options),
  });
}

export interface BoardColumn {
  /** Id de la columna: el valor del enum en las por defecto, un cuid en las propias (ver boardColumns.ts). */
  columnaId: string;
  messages: Message[];
}

/**
 * Tablero kanban (Fase 3): tareas y recordatorios agrupados por estado,
 * dentro de cada columna en el orden que el usuario haya dejado al
 * arrastrarlas (o de creación, si nunca las ha reordenado — `orden` nace
 * como la fecha en milisegundos). Mismo alcance que el viejo "Pendientes"
 * (categorías accionables) — solo que ahora también se ven las ya hechas,
 * en su propia columna, en vez de desaparecer sin más. Alcance por
 * `workspaceId` (el activo) — dentro de un workspace de equipo, el
 * tablero es compartido entre todos sus miembros.
 */
const BOARD_HECHO_LIMIT = 50;

/**
 * `hiddenCategories`: ver el mismo parámetro en `getCategoryGroups` — mismo
 * criterio, preferencia personal. `columnas`: las columnas efectivas del
 * workspace (ver resolverColumnas en boardColumns.ts) — se reparten las
 * tarjetas entre ellas con `columnaDeTarjeta`, que sabe caer en la columna
 * por defecto de la fase cuando una tarjeta no tiene columna propia (o la
 * tenía y se borró).
 */
export async function getBoardGroups(
  workspaceId: string,
  hiddenCategories: readonly string[] = [],
  columnas: ColumnaTablero[] = resolverColumnas([]),
): Promise<BoardColumn[]> {
  const visibleActionable = ACTIONABLE_CATEGORIES.filter((c) => !hiddenCategories.includes(c));
  // HECHO se acumula sin fin con el uso normal (tareas completadas de
  // siempre) — se trae aparte y limitada a las más recientes, mismo
  // criterio que `getCategoryGroups`. POR_HACER/EN_PROGRESO sin límite: se
  // autolimitan solas con el uso normal (trabajo activo, no historial).
  const [pendientes, hechas] = await Promise.all([
    prisma.message.findMany({
      where: { workspaceId, categoria: { in: visibleActionable }, estado: { not: "HECHO" } },
      orderBy: { orden: "desc" },
    }),
    prisma.message.findMany({
      where: { workspaceId, categoria: { in: visibleActionable }, estado: "HECHO" },
      orderBy: { fecha: "desc" },
      take: BOARD_HECHO_LIMIT,
    }),
  ]);

  const porColumna = new Map<string, Message[]>(columnas.map((c) => [c.id, []]));
  for (const m of [...pendientes, ...hechas]) {
    porColumna.get(columnaDeTarjeta(m, columnas))?.push(m);
  }
  return columnas.map((c) => ({ columnaId: c.id, messages: porColumna.get(c.id) ?? [] }));
}
