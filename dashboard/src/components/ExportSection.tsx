"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { exportData, type ExportFormat } from "@/app/(dashboard)/cuenta/actions";
import type { ExportScope } from "@/lib/exportData";
import { CATEGORIES, CATEGORY_PRESENTATION, isCategory } from "@/lib/categories";
import { Button } from "./ui/button";
import { Select } from "@/components/ui/select";

/** Tipo MIME por formato — el de Obsidian es el único binario (un .zip). */
const MIME_BY_FORMAT: Record<ExportFormat, string> = {
  markdown: "text/markdown",
  json: "application/json",
  csv: "text/csv",
  obsidian: "application/zip",
};

/**
 * `atob` da una string binaria (un byte por carácter) — hace falta pasarla
 * a bytes de verdad para el Blob. `new ArrayBuffer(...)` explícito (en vez
 * de dejar que `Uint8Array` reserve el suyo) para que el `.buffer` resultante
 * tipe como `ArrayBuffer` y no como el `ArrayBufferLike` más laxo que
 * `BlobPart` rechaza.
 */
function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type ScopeValue = "todo" | "notas" | string;

function toExportScope(value: ScopeValue): ExportScope | null {
  if (value === "todo") return { type: "todo" };
  if (value === "notas") return { type: "notas" };
  return isCategory(value) ? { type: "categoria", categoria: value } : null;
}

/**
 * Exportación de datos (casi obligatoria de cara a RGPD): alcance
 * seleccionable, en Markdown/JSON (todo lo que quepa en el alcance), CSV
 * (notas, para hoja de cálculo) o un vault de Obsidian en .zip (un archivo
 * por nota, con front matter). Descarga directa en el navegador — sin
 * fichero temporal en el servidor, el contenido viaja como texto (o base64
 * para el .zip) y se convierte en un Blob aquí mismo.
 */
export function ExportSection() {
  const [scope, setScope] = useState<ScopeValue>("todo");
  const [format, setFormat] = useState<ExportFormat>("markdown");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successFilename, setSuccessFilename] = useState<string | null>(null);

  function resetFeedback() {
    setError(null);
    setSuccessFilename(null);
  }

  async function handleExport() {
    const exportScope = toExportScope(scope);
    if (!exportScope) {
      setError("Elige un alcance válido.");
      return;
    }
    resetFeedback();
    setPending(true);
    const result = await exportData(exportScope, format);
    setPending(false);

    if (result.error || !result.content || !result.filename) {
      setError(result.error ?? "No se ha podido generar la exportación.");
      return;
    }

    // El .zip de Obsidian viaja en base64 (contenido binario) — el resto
    // son texto tal cual. `binary` es lo que distingue los dos caminos.
    const blob = result.binary
      ? new Blob([base64ToBytes(result.content)], { type: MIME_BY_FORMAT[format] })
      : new Blob([result.content], { type: MIME_BY_FORMAT[format] });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
    setSuccessFilename(result.filename);
  }

  return (
    <div className="rounded-2xl border border-paper-line bg-paper-raised p-5">
      <p className="mb-1 font-display text-lg text-ink">Exportar tus datos</p>
      <p className="mb-3 text-sm text-muted">
        Descarga una copia de lo que has guardado — útil como backup o si algún día quieres llevarte tus datos a
        otro sitio.
      </p>
      <div className="flex flex-wrap gap-2">
        <Select
          value={scope}
          onChange={(e) => {
            setScope(e.target.value);
            resetFeedback();
          }}
          aria-label="Qué exportar"
        >
          <option value="todo">Todo (notas, calendario, ahorros)</option>
          <option value="notas">Solo notas y tareas</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              Solo {CATEGORY_PRESENTATION[c].label.toLowerCase()}
            </option>
          ))}
        </Select>
        <Select
          value={format}
          onChange={(e) => {
            setFormat(e.target.value as ExportFormat);
            resetFeedback();
          }}
          aria-label="Formato de exportación"
        >
          <option value="markdown">Markdown</option>
          <option value="json">JSON</option>
          <option value="csv">CSV (hoja de cálculo)</option>
          <option value="obsidian">Vault de Obsidian (.zip)</option>
        </Select>
        <Button type="button" onClick={handleExport} disabled={pending}>
          {pending ? (
            "Generando…"
          ) : (
            <>
              <Download aria-hidden size={15} /> Descargar
            </>
          )}
        </Button>
      </div>
      {(format === "csv" || format === "obsidian") && (
        <p className="mt-2 text-xs text-muted">
          {format === "csv"
            ? "El CSV cubre solo notas y tareas — para calendario o ahorros usa Markdown o JSON."
            : "Un archivo .md por nota, listo para arrastrar a tu vault — cubre solo notas y tareas."}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      {successFilename && (
        <p role="status" className="fade-in mt-2 text-sm text-muted">
          Descarga iniciada: <span className="font-medium text-ink">{successFilename}</span>
        </p>
      )}
    </div>
  );
}
