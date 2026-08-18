"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Columns3, Plus, Trash2, Pencil, Check, X, ChevronUp, ChevronDown } from "lucide-react";
import type { EstadoTarea } from "@prisma/client";
import {
  createBoardColumn,
  renameBoardColumn,
  deleteBoardColumn,
  reorderBoardColumns,
} from "@/app/(dashboard)/columnas/actions";
import { ESTADO_PRESENTATION, ESTADOS_TABLERO } from "@/lib/kanban";
import { MAX_COLUMNAS, MAX_NOMBRE_COLUMNA, type ColumnaTablero } from "@/lib/boardColumns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Qué significa cada fase, en las palabras de quien va a elegirla — no "EN_PROGRESO". */
const FASE_AYUDA: Record<EstadoTarea, string> = {
  POR_HACER: "todavía sin empezar",
  EN_PROGRESO: "se está trabajando en ello",
  HECHO: "terminado",
};

/**
 * Añadir, renombrar y borrar columnas del tablero.
 *
 * La decisión que hace que esto no rompa nada está aquí, a la vista: al
 * crear una columna hay que decir a qué FASE equivale. No es burocracia —
 * es lo que permite que "vencidas", "pendientes", el Asistente y los avisos
 * sigan entendiendo un tablero con columnas inventadas. Una tarjeta en "En
 * revisión" es, para todo lo demás, una tarea en curso.
 *
 * Tras cualquier cambio se hace `router.refresh()` en vez de mantener las
 * columnas en estado local: cambiar las columnas cambia también en qué
 * columna cae cada tarjeta (lo calcula el servidor, ver getBoardGroups), y
 * recalcular eso en el cliente sería duplicar esa regla.
 */
export function GestionColumnasDialog({ columnas }: { columnas: ColumnaTablero[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [fase, setFase] = useState<EstadoTarea>("EN_PROGRESO");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");

  function ejecutar(accion: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await accion();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleCrear() {
    if (!nombre.trim()) return;
    ejecutar(async () => {
      const r = await createBoardColumn(nombre, fase);
      if (!r.error) setNombre("");
      return r;
    });
  }

  function handleRenombrar(id: string) {
    ejecutar(async () => {
      const r = await renameBoardColumn(id, nombreEditado);
      if (!r.error) setEditandoId(null);
      return r;
    });
  }

  /**
   * Mover una columna un puesto. Flechas y no arrastrar: dentro de un
   * diálogo, arrastrar es incómodo con el dedo y no funciona con teclado —
   * y aquí solo hay que mover una fila un sitio, no reorganizar cien.
   */
  function handleMover(indice: number, direccion: -1 | 1) {
    const destino = indice + direccion;
    if (destino < 0 || destino >= columnas.length) return;
    const orden = columnas.map((c) => c.id);
    [orden[indice], orden[destino]] = [orden[destino]!, orden[indice]!];
    ejecutar(() => reorderBoardColumns(orden));
  }

  const alLimite = columnas.length >= MAX_COLUMNAS;
  // Las tres por defecto no se reordenan: su orden ES el ciclo de trabajo
  // (por hacer → en curso → hecho). En cuanto se crea una columna propia,
  // todas pasan a ser propias (ver createBoardColumn) y ya sí se pueden
  // mover.
  const sePuedeReordenar = columnas.length > 1 && columnas.every((c) => c.esPersonalizada);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          setEditandoId(null);
          setNombre("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          <Columns3 aria-hidden size={15} /> Columnas
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Columnas del tablero</DialogTitle>
        </DialogHeader>

        <ul className="mb-4 flex flex-col gap-1">
          {columnas.map((c, i) => {
            const { Icon, color, label } = ESTADO_PRESENTATION[c.fase];
            return (
              <li key={c.id} className="flex items-center gap-2 rounded-lg p-1.5 text-sm">
                {sePuedeReordenar && editandoId !== c.id && (
                  <span className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => handleMover(i, -1)}
                      disabled={pending || i === 0}
                      aria-label={`Mover ${c.nombre} a la izquierda`}
                      className="rounded p-0.5 text-muted transition-colors hover:text-accent-strong disabled:opacity-25"
                    >
                      <ChevronUp aria-hidden size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMover(i, 1)}
                      disabled={pending || i === columnas.length - 1}
                      aria-label={`Mover ${c.nombre} a la derecha`}
                      className="rounded p-0.5 text-muted transition-colors hover:text-accent-strong disabled:opacity-25"
                    >
                      <ChevronDown aria-hidden size={13} />
                    </button>
                  </span>
                )}
                <Icon aria-hidden size={15} className={`shrink-0 ${color}`} />
                {editandoId === c.id ? (
                  <>
                    <Input
                      value={nombreEditado}
                      onChange={(e) => setNombreEditado(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenombrar(c.id);
                        if (e.key === "Escape") setEditandoId(null);
                      }}
                      maxLength={MAX_NOMBRE_COLUMNA}
                      autoFocus
                      aria-label={`Nuevo nombre para ${c.nombre}`}
                      className="h-8 flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => handleRenombrar(c.id)}
                      disabled={pending}
                      aria-label="Guardar nombre"
                      className="shrink-0 rounded-full p-1 text-accent hover:bg-accent-soft"
                    >
                      <Check aria-hidden size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditandoId(null)}
                      aria-label="Cancelar"
                      className="shrink-0 rounded-full p-1 text-muted hover:bg-danger-soft hover:text-danger"
                    >
                      <X aria-hidden size={15} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-ink">{c.nombre}</span>
                    <span className="shrink-0 text-xs text-muted">{label}</span>
                    {c.esPersonalizada && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditandoId(c.id);
                            setNombreEditado(c.nombre);
                          }}
                          aria-label={`Renombrar ${c.nombre}`}
                          className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong"
                        >
                          <Pencil aria-hidden size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => ejecutar(() => deleteBoardColumn(c.id))}
                          disabled={pending}
                          aria-label={`Borrar la columna ${c.nombre}`}
                          title="Las tarjetas no se pierden: vuelven a la columna por defecto de su fase"
                          className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 aria-hidden size={13} />
                        </button>
                      </>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-2 border-t border-paper-line pt-4">
          <p className="text-sm font-medium text-ink">Añadir una columna</p>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCrear();
            }}
            placeholder="En revisión, Esperando al cliente…"
            maxLength={MAX_NOMBRE_COLUMNA}
            disabled={alLimite}
            aria-label="Nombre de la columna nueva"
          />
          <label className="flex flex-col gap-1 text-xs text-muted">
            ¿Qué significa estar en esta columna?
            <select
              value={fase}
              onChange={(e) => setFase(e.target.value as EstadoTarea)}
              disabled={alLimite}
              className="rounded-lg border border-paper-line bg-paper px-3 py-2 text-sm text-ink outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {ESTADOS_TABLERO.map((f) => (
                <option key={f} value={f}>
                  {ESTADO_PRESENTATION[f].label} — {FASE_AYUDA[f]}
                </option>
              ))}
            </select>
          </label>
          {/* Explicar el porqué aquí, no en la documentación: es la única
              pregunta rara del formulario, y sin respuesta parece un trámite. */}
          <p className="text-xs text-muted">
            Sirve para que el resto de la aplicación siga entendiendo tu tablero: lo que marques como
            «{ESTADO_PRESENTATION.HECHO.label}» cuenta como terminado en las cifras, los avisos y el Asistente.
          </p>
          <Button type="button" onClick={handleCrear} disabled={pending || alLimite || nombre.trim() === ""} className="w-fit">
            <Plus aria-hidden size={15} /> {pending ? "Guardando…" : "Añadir columna"}
          </Button>
          {alLimite && (
            <p className="text-xs text-muted">
              Ya tienes {MAX_COLUMNAS} columnas — un tablero más ancho deja de leerse de un vistazo.
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
