import type { Message, Evento, CuentaAhorro, MovimientoAhorro } from "@prisma/client";
import { prisma } from "./prisma";
import { presentCategory, isCategory, type Category } from "./categories";
import { formatCentimos } from "./money";

/** Alcance de la exportación: toda la cuenta, solo notas/tareas, o una categoría concreta. */
export type ExportScope = { type: "todo" } | { type: "notas" } | { type: "categoria"; categoria: Category };

export function isExportScope(value: unknown): value is ExportScope {
  if (typeof value !== "object" || value === null || !("type" in value)) return false;
  const v = value as { type: unknown; categoria?: unknown };
  if (v.type === "todo" || v.type === "notas") return true;
  return v.type === "categoria" && typeof v.categoria === "string" && isCategory(v.categoria);
}

export interface ExportPayload {
  generatedAt: string;
  scope: ExportScope;
  notas: Message[];
  eventos: Evento[];
  ahorros: { cuenta: CuentaAhorro; movimientos: MovimientoAhorro[] }[];
}

/**
 * Lee todo lo que entra en el alcance pedido, siempre acotado al usuario de
 * la sesión. Exportación completa de datos (RGPD): mismo criterio de dueño
 * que el resto de la app — `where: { userId }` en cada consulta, nunca se
 * confía en un id suelto.
 */
export async function buildExportData(userId: string, scope: ExportScope): Promise<ExportPayload> {
  const notasWhere =
    scope.type === "categoria"
      ? { userId, categoria: scope.categoria }
      : { userId };

  const notas = await prisma.message.findMany({ where: notasWhere, orderBy: { fecha: "asc" } });

  if (scope.type !== "todo") {
    return { generatedAt: new Date().toISOString(), scope, notas, eventos: [], ahorros: [] };
  }

  const [eventos, cuentas] = await Promise.all([
    prisma.evento.findMany({ where: { userId }, orderBy: { fechaInicio: "asc" } }),
    prisma.cuentaAhorro.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
  ]);
  const movimientosPorCuenta = await Promise.all(
    cuentas.map((cuenta) =>
      prisma.movimientoAhorro.findMany({ where: { cuentaId: cuenta.id }, orderBy: { fecha: "asc" } }),
    ),
  );
  const ahorros = cuentas.map((cuenta, i) => ({ cuenta, movimientos: movimientosPorCuenta[i]! }));

  return { generatedAt: new Date().toISOString(), scope, notas, eventos, ahorros };
}

export function toExportJson(payload: ExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

const DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

/**
 * Volcado en Markdown, pensado para leer o archivar — no para reimportar.
 * Pura: mismo criterio que `lib/calendar.ts`/`lib/ahorros.ts`, testeable
 * sin tocar la base de datos.
 */
export function toExportMarkdown(payload: ExportPayload): string {
  const lines: string[] = [];
  lines.push("# Exportación de MemorIAble", "", `Generada: ${DATE_FORMATTER.format(new Date(payload.generatedAt))}`, "");

  lines.push(`## Notas (${payload.notas.length})`, "");
  if (payload.notas.length === 0) {
    lines.push("_Nada por aquí._", "");
  }
  for (const nota of payload.notas) {
    const { label } = presentCategory(nota.categoria);
    lines.push(`### ${nota.resumen || "(sin resumen)"}`);
    lines.push(`- Categoría: ${label}`);
    lines.push(`- Fecha: ${DATE_FORMATTER.format(nota.fecha)}`);
    lines.push(`- Estado: ${nota.estado} · Prioridad: ${nota.prioridad}`);
    if (nota.etiquetas.length > 0) lines.push(`- Etiquetas: ${nota.etiquetas.join(", ")}`);
    lines.push("", nota.contenido, "");
  }

  if (payload.scope.type === "todo") {
    lines.push(`## Eventos (${payload.eventos.length})`, "");
    if (payload.eventos.length === 0) lines.push("_Nada por aquí._", "");
    for (const evento of payload.eventos) {
      lines.push(`### ${evento.titulo}`);
      lines.push(`- Inicio: ${DATE_FORMATTER.format(evento.fechaInicio)}`);
      if (evento.fechaFin) lines.push(`- Fin: ${DATE_FORMATTER.format(evento.fechaFin)}`);
      if (evento.ubicacion) lines.push(`- Ubicación: ${evento.ubicacion}`);
      if (evento.participantes.length > 0) lines.push(`- Participantes: ${evento.participantes.join(", ")}`);
      if (evento.descripcion) lines.push("", evento.descripcion);
      lines.push("");
    }

    lines.push(`## Ahorros (${payload.ahorros.length} cuentas)`, "");
    if (payload.ahorros.length === 0) lines.push("_Nada por aquí._", "");
    for (const { cuenta, movimientos } of payload.ahorros) {
      const saldo = movimientos.reduce((sum, m) => sum + m.centimos, 0);
      lines.push(`### ${cuenta.nombre}`);
      lines.push(`- Saldo: ${formatCentimos(saldo)}`);
      if (cuenta.objetivoCentimos != null) lines.push(`- Objetivo: ${formatCentimos(cuenta.objetivoCentimos)}`);
      lines.push("", "| Fecha | Importe | Concepto |", "| --- | --- | --- |");
      for (const m of movimientos) {
        lines.push(`| ${DATE_FORMATTER.format(m.fecha)} | ${formatCentimos(m.centimos)} | ${m.concepto ?? ""} |`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
