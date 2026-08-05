"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { exportData } from "@/app/(dashboard)/cuenta/actions";
import type { ExportScope } from "@/lib/exportData";
import { CATEGORIES, CATEGORY_PRESENTATION, isCategory } from "@/lib/categories";
import { Button } from "./ui/button";

const SELECT_CLASSNAME =
  "rounded-lg border border-paper-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40";

type ScopeValue = "todo" | "notas" | string;

function toExportScope(value: ScopeValue): ExportScope | null {
  if (value === "todo") return { type: "todo" };
  if (value === "notas") return { type: "notas" };
  return isCategory(value) ? { type: "categoria", categoria: value } : null;
}

/**
 * Exportación de datos (casi obligatoria de cara a RGPD): alcance
 * seleccionable, Markdown o JSON, descarga directa en el navegador — sin
 * fichero temporal en el servidor, el contenido viaja como texto y se
 * convierte en un Blob aquí mismo.
 */
export function ExportSection() {
  const [scope, setScope] = useState<ScopeValue>("todo");
  const [format, setFormat] = useState<"markdown" | "json">("markdown");
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

    const blob = new Blob([result.content], {
      type: format === "json" ? "application/json" : "text/markdown",
    });
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
        <select
          value={scope}
          onChange={(e) => {
            setScope(e.target.value);
            resetFeedback();
          }}
          aria-label="Qué exportar"
          className={SELECT_CLASSNAME}
        >
          <option value="todo">Todo (notas, calendario, ahorros)</option>
          <option value="notas">Solo notas y tareas</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              Solo {CATEGORY_PRESENTATION[c].label.toLowerCase()}
            </option>
          ))}
        </select>
        <select
          value={format}
          onChange={(e) => {
            setFormat(e.target.value as "markdown" | "json");
            resetFeedback();
          }}
          aria-label="Formato de exportación"
          className={SELECT_CLASSNAME}
        >
          <option value="markdown">Markdown</option>
          <option value="json">JSON</option>
        </select>
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
