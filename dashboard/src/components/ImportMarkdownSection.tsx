"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { importMarkdownFiles } from "@/app/(dashboard)/actions";
import { Button } from "./ui/button";

/**
 * Importar notas desde ficheros .md sueltos (Obsidian, o cualquier app que
 * exporte a texto plano) — la mitad que le faltaba a "exportar tus datos":
 * también se puede TRAER algo de fuera, no solo llevárselo.
 */
export function ImportMarkdownSection() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ importadas: number; fallidas: number } | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setResultado(null);
    setPending(true);

    const formData = new FormData();
    for (const file of Array.from(fileList)) formData.append("files", file);

    const result = await importMarkdownFiles(formData);
    setPending(false);
    if (inputRef.current) inputRef.current.value = "";

    if (result.error) {
      setError(result.error);
      return;
    }
    setResultado({ importadas: result.importadas, fallidas: result.fallidas });
  }

  return (
    <div className="rounded-2xl border border-paper-line bg-paper-raised p-5">
      <p className="mb-1 font-display text-lg text-ink">Importar notas en Markdown</p>
      <p className="mb-3 text-sm text-muted">
        Sube ficheros .md sueltos (de Obsidian o de cualquier app que exporte a texto plano) — cada uno se convierte
        en una nota, categorizada y resumida igual que si la hubieras escrito aquí. Hasta 12 ficheros por tanda.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".md,text/markdown"
        multiple
        disabled={pending}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
        id="import-markdown-input"
      />
      <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()} disabled={pending}>
        {pending ? (
          "Importando…"
        ) : (
          <>
            <Upload aria-hidden size={15} /> Elegir ficheros
          </>
        )}
      </Button>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      {resultado && (
        <p role="status" className="fade-in mt-2 text-sm text-muted">
          {resultado.importadas} nota{resultado.importadas === 1 ? "" : "s"} importada
          {resultado.importadas === 1 ? "" : "s"}
          {resultado.fallidas > 0 ? ` · ${resultado.fallidas} fallida${resultado.fallidas === 1 ? "" : "s"}` : ""}.
        </p>
      )}
    </div>
  );
}
