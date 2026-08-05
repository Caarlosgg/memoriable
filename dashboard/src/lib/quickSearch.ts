import { prisma } from "./prisma";

export interface QuickSearchResult {
  id: string;
  tipo: "nota" | "evento" | "ahorro";
  titulo: string;
  subtitulo: string;
  href: string;
}

const MIN_QUERY_LENGTH = 2;
const PER_TYPE_LIMIT = 4;
const TOTAL_LIMIT = 8;

/**
 * Búsqueda rápida para la paleta de comandos (Ctrl/Cmd+K): texto simple
 * (`contains`, sin acentos-insensitive por ahora) sobre lo que ya está en
 * la base de datos — notas/tareas, eventos y cuentas de ahorro. A
 * propósito NO usa embeddings/búsqueda semántica: tiene que responder en
 * cada tecleo, y la semántica (si llega, Tier 3) tiene otro coste y otro
 * sitio (el Asistente).
 */
export async function searchAcrossAll(userId: string, query: string): Promise<QuickSearchResult[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY_LENGTH) return [];

  const [messages, eventos, cuentas] = await Promise.all([
    prisma.message.findMany({
      where: {
        userId,
        OR: [{ resumen: { contains: q, mode: "insensitive" } }, { contenido: { contains: q, mode: "insensitive" } }],
      },
      orderBy: { fecha: "desc" },
      take: PER_TYPE_LIMIT,
    }),
    prisma.evento.findMany({
      where: { userId, titulo: { contains: q, mode: "insensitive" } },
      orderBy: { fechaInicio: "desc" },
      take: PER_TYPE_LIMIT,
    }),
    prisma.cuentaAhorro.findMany({
      where: { userId, nombre: { contains: q, mode: "insensitive" } },
      take: PER_TYPE_LIMIT,
    }),
  ]);

  const results: QuickSearchResult[] = [
    ...messages.map(
      (m): QuickSearchResult => ({
        id: m.id,
        tipo: "nota",
        titulo: m.resumen,
        subtitulo: m.categoria,
        href: `/categorias?mensaje=${m.id}#mensaje-${m.id}`,
      }),
    ),
    ...eventos.map(
      (e): QuickSearchResult => ({
        id: e.id,
        tipo: "evento",
        titulo: e.titulo,
        subtitulo: "Evento",
        href: "/calendario",
      }),
    ),
    ...cuentas.map(
      (c): QuickSearchResult => ({
        id: c.id,
        tipo: "ahorro",
        titulo: c.nombre,
        subtitulo: "Cuenta de ahorro",
        href: "/ahorros",
      }),
    ),
  ];

  return results.slice(0, TOTAL_LIMIT);
}
