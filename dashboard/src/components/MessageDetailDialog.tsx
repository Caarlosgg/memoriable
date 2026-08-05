"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { Message } from "@prisma/client";
import { Pencil, Clock } from "lucide-react";
import { presentCategory, CATEGORIES, CATEGORY_PRESENTATION } from "@/lib/categories";
import { ESTADO_PRESENTATION, ESTADOS_TABLERO, PRIORIDADES, PRIORIDAD_PRESENTATION } from "@/lib/kanban";
import { formatDate } from "@/lib/format";
import { updateMessage } from "@/app/(dashboard)/actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

/** Mismas clases que el select de categoría en SearchSection.tsx, para que todos los selects se vean igual. */
const SELECT_CLASSNAME =
  "rounded-lg border border-paper-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40";

interface EditableFields {
  resumen: string;
  contenido: string;
  categoria: string;
  estado: Message["estado"];
  prioridad: Message["prioridad"];
}

function fieldsFrom(message: Message): EditableFields {
  return {
    resumen: message.resumen,
    contenido: message.contenido,
    categoria: message.categoria,
    estado: message.estado,
    prioridad: message.prioridad,
  };
}

/**
 * Modal de detalle/edición reutilizable (Fase B): envuelve cualquier
 * disparador (una `MessageCard`, una `KanbanCard`...) y muestra la nota
 * completa. La edición solo se confirma con el botón "Guardar" — nunca
 * autosave — y "Cancelar" descarta los cambios sin tocar el servidor.
 */
export function MessageDetailDialog({
  message,
  children,
  defaultEditing = false,
}: {
  message: Message;
  /** Lo que abre el modal al hacer clic — se envuelve con `DialogTrigger asChild`. */
  children: ReactNode;
  /** Abre directamente en modo edición (usado desde el tablero, Fase C). */
  defaultEditing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(defaultEditing);
  const [fields, setFields] = useState<EditableFields>(() => fieldsFrom(message));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Cada apertura arranca desde los datos actuales, por si la nota se
      // editó en otra pestaña/vista entre un cierre y la siguiente apertura.
      setFields(fieldsFrom(message));
      setEditing(defaultEditing);
      setError(null);
    }
  }

  function handleCancel() {
    setFields(fieldsFrom(message));
    setError(null);
    setEditing(false);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateMessage(message.id, fields);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  const { Icon: CategoryIcon, label: categoryLabel, color } = presentCategory(message.categoria);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Editar nota" : message.resumen || "(sin resumen)"}</DialogTitle>
        </DialogHeader>

        {!editing ? (
          <div className="flex flex-col gap-4">
            <p className={`flex items-center gap-1.5 text-xs font-semibold ${color}`}>
              <CategoryIcon aria-hidden size={14} /> {categoryLabel}
            </p>
            <p className="text-sm whitespace-pre-wrap text-ink">{message.contenido}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-paper-line pt-3 text-xs text-muted">
              <span className="flex items-center gap-1">
                <Clock aria-hidden size={12} /> {formatDate(message.fecha)}
              </span>
              <span>{ESTADO_PRESENTATION[message.estado].label}</span>
              <span>Prioridad {PRIORIDAD_PRESENTATION[message.prioridad].label}</span>
            </div>
            <DialogFooter className="mt-0">
              <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
                <Pencil aria-hidden size={15} /> Editar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="detalle-resumen" className="text-sm font-medium text-ink">
                Resumen
              </label>
              <Input
                id="detalle-resumen"
                value={fields.resumen}
                onChange={(e) => setFields((f) => ({ ...f, resumen: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="detalle-contenido" className="text-sm font-medium text-ink">
                Contenido
              </label>
              <Textarea
                id="detalle-contenido"
                rows={4}
                value={fields.contenido}
                onChange={(e) => setFields((f) => ({ ...f, contenido: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="detalle-categoria" className="text-sm font-medium text-ink">
                  Categoría
                </label>
                <select
                  id="detalle-categoria"
                  className={SELECT_CLASSNAME}
                  value={fields.categoria}
                  onChange={(e) => setFields((f) => ({ ...f, categoria: e.target.value }))}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_PRESENTATION[c].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="detalle-estado" className="text-sm font-medium text-ink">
                  Estado
                </label>
                <select
                  id="detalle-estado"
                  className={SELECT_CLASSNAME}
                  value={fields.estado}
                  onChange={(e) => setFields((f) => ({ ...f, estado: e.target.value as Message["estado"] }))}
                >
                  {ESTADOS_TABLERO.map((estado) => (
                    <option key={estado} value={estado}>
                      {ESTADO_PRESENTATION[estado].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="detalle-prioridad" className="text-sm font-medium text-ink">
                  Prioridad
                </label>
                <select
                  id="detalle-prioridad"
                  className={SELECT_CLASSNAME}
                  value={fields.prioridad}
                  onChange={(e) => setFields((f) => ({ ...f, prioridad: e.target.value as Message["prioridad"] }))}
                >
                  {PRIORIDADES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORIDAD_PRESENTATION[p].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={handleCancel} disabled={pending}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleSave} disabled={pending}>
                {pending ? "Guardando…" : "Guardar"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
