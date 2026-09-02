import JSZip from "jszip";
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
 * la sesión. Exportación completa de datos (RGPD): `where: { userId }` en
 * cada consulta, nunca se confía en un id suelto.
 *
 * Fase Equipo: a propósito NO se migra a `workspaceId` como el resto de la
 * app — esto es "exporta todo lo que YO he escrito" (portabilidad de datos
 * personales), no "todo lo que veo ahora mismo". `userId` en Message/Evento
 * sigue significando "quien lo creó" tras la migración, así que sigue
 * siendo el filtro correcto: cambiarlo a `workspaceId` dejaría que
 * cualquier miembro de un equipo se descargara TODO el tablero compartido
 * con su propio botón de "exportar mis datos".
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

/** Escapa un valor para una celda CSV (RFC 4180): comillas dobladas, envuelto en comillas si hace falta. */
function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * CSV de las notas — pensado para abrir en una hoja de cálculo, no para
 * archivar todo (eventos y ahorros tienen columnas distintas entre sí y con
 * las notas; mezclarlos en una tabla no tendría filas coherentes). Por eso
 * exporta SIEMPRE `payload.notas`, sea cual sea el alcance pedido — con
 * alcance "todo" el CSV cubre notas/tareas, y para eventos/ahorros hace
 * falta Markdown o JSON (se lo dice el propio ExportSection al usuario).
 */
export function toExportCsv(payload: ExportPayload): string {
  const header = ["fecha", "categoria", "resumen", "contenido", "estado", "prioridad", "etiquetas"];
  const rows = payload.notas.map((nota) =>
    [
      nota.fecha.toISOString(),
      nota.categoria,
      nota.resumen,
      nota.contenido,
      nota.estado,
      nota.prioridad,
      nota.etiquetas.join("; "),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

// Rango Unicode de marcas diacríticas combinadas (U+0300–U+036F) — lo que
// queda de una tilde tras `normalize("NFD")" (é -> e + ´). Escape numérico
// explícito, no un carácter literal, para que no dependa de la codificación
// con la que se abra este archivo en otro editor.
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Recorta y sanea un texto para que sirva de nombre de archivo en cualquier sistema operativo. */
function slugify(text: string, maxLength: number): string {
  const slug = text
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (slug || "nota").slice(0, maxLength);
}

/** Escapa un valor de texto para un scalar YAML entre comillas dobles. */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Una nota → un archivo `.md` con front matter YAML (categoría, fecha,
 * estado, prioridad, etiquetas). Es justo lo que distingue "compatible con
 * Obsidian" de un volcado en Markdown cualquiera: Obsidian indexa, enlaza y
 * filtra por NOTA, no por sección de un documento — el volcado de
 * `toExportMarkdown` (un solo archivo con todo dentro) no le sirve de vault,
 * aunque también sea texto en Markdown.
 */
function noteToObsidianFile(nota: Message): string {
  const { label } = presentCategory(nota.categoria);
  const frontMatter = [
    "---",
    `categoria: ${yamlString(label)}`,
    `fecha: ${nota.fecha.toISOString()}`,
    `estado: ${yamlString(nota.estado)}`,
    `prioridad: ${yamlString(nota.prioridad)}`,
    nota.etiquetas.length > 0 ? `etiquetas: [${nota.etiquetas.map(yamlString).join(", ")}]` : "etiquetas: []",
    "---",
    "",
  ].join("\n");
  const titulo = nota.resumen.trim() || "(sin resumen)";
  return `${frontMatter}# ${titulo}\n\n${nota.contenido}\n`;
}

/**
 * Vault de Obsidian en un .zip: un archivo por nota, con nombres únicos (el
 * cuid de la nota va al final del nombre — nunca puede colisionar, aunque
 * dos resúmenes se parezcan). Devuelve el zip como buffer, listo para
 * mandar al cliente en base64 (ver `exportData` en cuenta/actions.ts).
 */
export async function buildObsidianVaultZip(payload: ExportPayload): Promise<Buffer> {
  const zip = new JSZip();
  for (const nota of payload.notas) {
    const dateSlug = nota.fecha.toISOString().slice(0, 10);
    const nombreSlug = slugify(nota.resumen || nota.contenido, 60);
    const filename = `${dateSlug}-${nombreSlug}-${nota.id.slice(-6)}.md`;
    zip.file(filename, noteToObsidianFile(nota));
  }
  return zip.generateAsync({ type: "nodebuffer" });
}
