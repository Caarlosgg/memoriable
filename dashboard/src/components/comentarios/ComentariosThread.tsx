"use client";

import { useEffect, useState, useTransition } from "react";
import { MessageSquare, Send, Pencil, Trash2, X, Check } from "lucide-react";
import {
  listComentarios,
  createComentario,
  updateComentario,
  deleteComentario,
  type ComentarioView,
} from "@/app/(dashboard)/comentarios/actions";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SkeletonText } from "@/components/ui/skeleton";

/** Fecha relativa corta ("hace 5 min") — en un hilo importa cuánto hace, no el timestamp exacto. */
function haceCuanto(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias < 7) return `hace ${dias} d`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

/**
 * Hilo de comentarios sobre una nota o un evento — así es como el equipo se
 * comunica dentro del trabajo, en vez de en un chat aparte (ver el modelo
 * `Comentario` en schema.prisma para el razonamiento completo).
 *
 * Se carga bajo demanda al montar, no con la nota: la mayoría de notas no
 * tienen comentarios y no vale la pena pagar esa consulta en cada tarjeta de
 * un listado.
 */
export function ComentariosThread({
  messageId,
  eventoId,
}: {
  messageId?: string;
  eventoId?: string;
}) {
  const [comentarios, setComentarios] = useState<ComentarioView[]>([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEditado, setTextoEditado] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelado = false;
    listComentarios(messageId, eventoId)
      .then((lista) => {
        if (!cancelado) setComentarios(lista);
      })
      .catch((err) => {
        console.error("No se pudieron cargar los comentarios:", err);
        if (!cancelado) setError("No se han podido cargar los comentarios.");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    // Evita pintar los comentarios de una nota en otra si se cambia rápido
    // de una a otra (la petición anterior puede resolver después).
    return () => {
      cancelado = true;
    };
  }, [messageId, eventoId]);

  function handleEnviar() {
    const trimmed = texto.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const result = await createComentario(trimmed, messageId, eventoId);
      if (result.error || !result.comentario) {
        setError(result.error ?? "No se ha podido publicar el comentario.");
        return;
      }
      setComentarios((prev) => [...prev, result.comentario!]);
      setTexto("");
    });
  }

  function handleGuardarEdicion(id: string) {
    const trimmed = textoEditado.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const result = await updateComentario(id, trimmed);
      if (result.error) {
        setError(result.error);
        return;
      }
      setComentarios((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, texto: trimmed, editadoAt: new Date().toISOString() } : c,
        ),
      );
      setEditandoId(null);
    });
  }

  function handleBorrar(id: string) {
    const previos = comentarios;
    setComentarios((prev) => prev.filter((c) => c.id !== id));
    startTransition(async () => {
      const result = await deleteComentario(id);
      // Si falla, se restaura: mejor que el comentario reaparezca a que el
      // usuario crea que lo borró y siga ahí para todos los demás.
      if (result.error) {
        setComentarios(previos);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 border-t border-paper-line pt-4">
      <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
        <MessageSquare aria-hidden size={15} />
        Comentarios
        {comentarios.length > 0 && <span className="text-muted">({comentarios.length})</span>}
      </p>

      {cargando ? (
        <SkeletonText lines={2} />
      ) : comentarios.length === 0 ? (
        <p className="text-sm text-muted">
          Nadie ha comentado todavía. Menciona a alguien con @ para avisarle.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comentarios.map((c) => (
            <li key={c.id} className="flex gap-2">
              <Avatar email={c.email} size="sm" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="font-medium text-ink">{c.nombre}</span>
                  <span className="text-muted">{haceCuanto(c.createdAt)}</span>
                  {c.editadoAt && <span className="text-muted">(editado)</span>}
                </p>

                {editandoId === c.id ? (
                  <div className="mt-1 flex flex-col gap-1.5">
                    <Textarea
                      value={textoEditado}
                      onChange={(e) => setTextoEditado(e.target.value)}
                      rows={2}
                      aria-label="Editar comentario"
                    />
                    <div className="flex gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleGuardarEdicion(c.id)}
                        disabled={pending}
                      >
                        <Check aria-hidden size={13} /> Guardar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditandoId(null)}
                      >
                        <X aria-hidden size={13} /> Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm whitespace-pre-wrap text-ink">{c.texto}</p>
                    {c.esMio && (
                      <div className="mt-0.5 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditandoId(c.id);
                            setTextoEditado(c.texto);
                          }}
                          className="flex items-center gap-1 text-xs text-muted transition-colors hover:text-accent-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                        >
                          <Pencil aria-hidden size={11} /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBorrar(c.id)}
                          disabled={pending}
                          className="flex items-center gap-1 text-xs text-muted transition-colors hover:text-danger focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-60"
                        >
                          <Trash2 aria-hidden size={11} /> Borrar
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1.5">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // Enviar con Ctrl/Cmd+Enter — Enter suelto hace salto de línea,
            // que es lo que se espera de un campo de varias líneas.
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleEnviar();
            }
          }}
          rows={2}
          placeholder="Comenta algo… (@ para mencionar)"
          aria-label="Escribir un comentario"
        />
        <Button
          type="button"
          size="sm"
          onClick={handleEnviar}
          disabled={pending || texto.trim() === ""}
          className="self-start"
        >
          <Send aria-hidden size={14} /> Comentar
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
