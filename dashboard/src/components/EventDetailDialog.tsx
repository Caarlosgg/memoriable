"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { Evento } from "@prisma/client";
import Link from "next/link";
import { Pencil, Trash2, Clock, MapPin, Users, FileText, Repeat } from "lucide-react";
import { formatEventDate } from "@/lib/format";
import { FRECUENCIAS, type Frecuencia } from "@/lib/calendar";
import {
  createEvento,
  updateEvento,
  deleteEvento,
  assignEvento,
  type EventoInput,
} from "@/app/(dashboard)/calendario/actions";
import type { WorkspaceMemberInfo } from "@/lib/workspace";
import { AssigneeControl } from "./AssigneeControl";
import { ComentariosThread } from "./comentarios/ComentariosThread";
import { useUndoToast } from "./UndoToast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

const FRECUENCIA_LABEL: Record<Frecuencia, string> = {
  DIARIA: "cada día",
  SEMANAL: "cada semana",
  QUINCENAL: "cada 2 semanas",
  MENSUAL: "cada mes",
};

/** `<input type="datetime-local">` no acepta un `Date` directo — quiere `YYYY-MM-DDTHH:mm` en hora LOCAL del navegador. */
function toDatetimeLocalValue(date: Date | null): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface EditableEvento {
  titulo: string;
  descripcion: string;
  fechaInicio: string;
  fechaFin: string;
  ubicacion: string;
  participantesTexto: string;
  /** Solo se ofrece al crear (ver isNew) — repetir un evento ya existente no tiene el mismo significado que crear una serie nueva. */
  repetirActivo: boolean;
  repetirFrecuencia: Frecuencia;
  repetirVeces: string;
}

const DEFAULT_REPETIR_VECES = "5";

function fieldsFrom(evento: Partial<Evento> | null): EditableEvento {
  return {
    titulo: evento?.titulo ?? "",
    descripcion: evento?.descripcion ?? "",
    fechaInicio: toDatetimeLocalValue(evento?.fechaInicio ?? null),
    fechaFin: toDatetimeLocalValue(evento?.fechaFin ?? null),
    ubicacion: evento?.ubicacion ?? "",
    participantesTexto: (evento?.participantes ?? []).join(", "),
    repetirActivo: false,
    repetirFrecuencia: "SEMANAL",
    repetirVeces: DEFAULT_REPETIR_VECES,
  };
}

function toInput(fields: EditableEvento, isNew: boolean): EventoInput {
  const veces = Number.parseInt(fields.repetirVeces, 10);
  return {
    titulo: fields.titulo,
    descripcion: fields.descripcion || undefined,
    fechaInicio: fields.fechaInicio,
    fechaFin: fields.fechaFin || undefined,
    ubicacion: fields.ubicacion || undefined,
    participantes: fields.participantesTexto
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean),
    repetir:
      isNew && fields.repetirActivo && Number.isInteger(veces) && veces >= 2
        ? { frecuencia: fields.repetirFrecuencia, veces }
        : undefined,
  };
}

/**
 * Modal de detalle/edición de un evento — mismo patrón que
 * MessageDetailDialog (Fase B): ver/editar con Guardar/Cancelar explícitos.
 * Dos modos de uso: envolviendo un disparador ya existente (evento real,
 * `evento` con datos) o suelto con un botón "Nuevo evento" (crear, sin
 * `evento`, arranca directo en edición).
 */
export function EventDetailDialog({
  evento,
  members = [],
  children,
  onChanged,
  onDeleted,
  onUndoDelete,
  defaultOpen = false,
}: {
  /** `null`/ausente = modal de creación (arranca en modo edición vacío). */
  evento?: Evento | null;
  /** Miembros del workspace activo, para "Asignar a…" — vacío en modo personal. */
  members?: WorkspaceMemberInfo[];
  children: ReactNode;
  /** Se llama tras crear o guardar con éxito, para refrescar la lista del padre. */
  onChanged?: () => void;
  /** Se llama AL INSTANTE al pulsar "Borrar" — el padre debe ocultar el evento ya. */
  onDeleted?: (id: string) => void;
  /** Se llama si el usuario pulsa "Deshacer" en el toast. */
  onUndoDelete?: (id: string) => void;
  /** Arranca ya abierto — usado por CalendarView para el evento de `?evento=ID` (notificación de asignación). */
  defaultOpen?: boolean;
}) {
  const isNew = !evento;
  const [open, setOpen] = useState(defaultOpen);
  const [editing, setEditing] = useState(isNew);
  const [fields, setFields] = useState<EditableEvento>(() => fieldsFrom(evento ?? null));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { scheduleDelete } = useUndoToast();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setFields(fieldsFrom(evento ?? null));
      setEditing(isNew);
      setError(null);
    }
  }

  function handleCancel() {
    if (isNew) {
      setOpen(false);
      return;
    }
    setFields(fieldsFrom(evento ?? null));
    setError(null);
    setEditing(false);
  }

  function handleSave() {
    setError(null);
    const input = toInput(fields, isNew);
    startTransition(async () => {
      const result = isNew || !evento ? await createEvento(input) : await updateEvento(evento.id, input);
      if (result.error) {
        setError(result.error);
        return;
      }
      onChanged?.();
      if (isNew) setOpen(false);
      else setEditing(false);
    });
  }

  /** Igual que MessageDetailDialog (Tier 1.3): oculta y cierra ya, borra de verdad tras el margen de deshacer. */
  function handleDelete() {
    if (!evento) return;
    const eventoId = evento.id;
    setOpen(false);
    onDeleted?.(eventoId);
    scheduleDelete({
      label: `«${evento.titulo}» eliminado`,
      onUndo: () => onUndoDelete?.(eventoId),
      onConfirm: async () => {
        const result = await deleteEvento(eventoId);
        if (result.error) {
          console.error("No se pudo completar el borrado del evento:", result.error);
          onUndoDelete?.(eventoId);
        }
      },
    });
  }

  /** Asignar/desasignar (Fase Equipo) — no toca `editing`, es una acción aparte del formulario. */
  function handleAssigneeChange(assigneeId: string | null) {
    if (!evento) return;
    startTransition(async () => {
      const result = await assignEvento(evento.id, assigneeId);
      if (result.error) {
        setError(result.error);
        return;
      }
      onChanged?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? (isNew ? "Nuevo evento" : "Editar evento") : evento?.titulo}</DialogTitle>
        </DialogHeader>

        {!editing && evento ? (
          <div className="flex flex-col gap-4">
            <p className="flex items-center gap-1.5 text-sm text-ink">
              <Clock aria-hidden size={14} className="shrink-0 text-accent" />
              {formatEventDate(evento.fechaInicio)}
              {evento.fechaFin ? ` — ${formatEventDate(evento.fechaFin)}` : ""}
            </p>
            {members.length > 0 && (
              <div className="flex items-center gap-1.5 text-sm text-ink">
                <span className="text-muted">Asignado a</span>
                <AssigneeControl assigneeId={evento.assigneeId} members={members} onChange={handleAssigneeChange} />
              </div>
            )}
            {evento.ubicacion && (
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <MapPin aria-hidden size={14} className="shrink-0" /> {evento.ubicacion}
              </p>
            )}
            {evento.participantes.length > 0 && (
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <Users aria-hidden size={14} className="shrink-0" /> {evento.participantes.join(", ")}
              </p>
            )}
            {evento.descripcion && (
              <p className="flex items-start gap-1.5 text-sm text-ink">
                <FileText aria-hidden size={14} className="mt-0.5 shrink-0 text-muted" />
                <span className="whitespace-pre-wrap">{evento.descripcion}</span>
              </p>
            )}
            {evento.messageId && (
              <Link
                href={`/categorias?mensaje=${evento.messageId}#mensaje-${evento.messageId}`}
                className="text-sm text-accent hover:text-accent-strong hover:underline"
              >
                Ver la nota que originó este evento →
              </Link>
            )}

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            {/* Mismo hilo de equipo que en las notas — ver ComentariosThread. */}
            <ComentariosThread eventoId={evento.id} />

            <DialogFooter className="mt-0 justify-between sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={handleDelete}
                disabled={pending}
                className="text-danger"
              >
                <Trash2 aria-hidden size={15} /> Borrar
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
                <Pencil aria-hidden size={15} /> Editar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="evento-titulo" className="text-sm font-medium text-ink">
                Título
              </label>
              <Input
                id="evento-titulo"
                value={fields.titulo}
                onChange={(e) => setFields((f) => ({ ...f, titulo: e.target.value }))}
                autoFocus={isNew}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="evento-inicio" className="text-sm font-medium text-ink">
                  Fecha y hora de inicio
                </label>
                <Input
                  id="evento-inicio"
                  type="datetime-local"
                  value={fields.fechaInicio}
                  onChange={(e) => setFields((f) => ({ ...f, fechaInicio: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="evento-fin" className="text-sm font-medium text-ink">
                  Fecha y hora de fin (opcional)
                </label>
                <Input
                  id="evento-fin"
                  type="datetime-local"
                  value={fields.fechaFin}
                  onChange={(e) => setFields((f) => ({ ...f, fechaFin: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="evento-ubicacion" className="text-sm font-medium text-ink">
                Ubicación
              </label>
              <Input
                id="evento-ubicacion"
                value={fields.ubicacion}
                onChange={(e) => setFields((f) => ({ ...f, ubicacion: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="evento-participantes" className="text-sm font-medium text-ink">
                Participantes
              </label>
              <Input
                id="evento-participantes"
                value={fields.participantesTexto}
                onChange={(e) => setFields((f) => ({ ...f, participantesTexto: e.target.value }))}
                placeholder="separados por comas: Ana, Marcos…"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="evento-descripcion" className="text-sm font-medium text-ink">
                Descripción
              </label>
              <Textarea
                id="evento-descripcion"
                rows={3}
                value={fields.descripcion}
                onChange={(e) => setFields((f) => ({ ...f, descripcion: e.target.value }))}
                placeholder="Opcional"
              />
            </div>

            {isNew && (
              <div className="flex flex-col gap-2 rounded-lg border border-paper-line p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={fields.repetirActivo}
                    onChange={(e) => setFields((f) => ({ ...f, repetirActivo: e.target.checked }))}
                    className="h-4 w-4 rounded border-paper-line accent-accent"
                  />
                  <Repeat aria-hidden size={14} className="text-muted" /> Se repite
                </label>
                {fields.repetirActivo && (
                  <div className="flex flex-wrap items-center gap-2 pl-6 text-sm text-ink">
                    <select
                      value={fields.repetirFrecuencia}
                      onChange={(e) => setFields((f) => ({ ...f, repetirFrecuencia: e.target.value as Frecuencia }))}
                      aria-label="Frecuencia de repetición"
                      className="rounded-lg border border-paper-line bg-paper px-2.5 py-1.5 text-sm outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
                    >
                      {FRECUENCIAS.map((f) => (
                        <option key={f} value={f}>
                          {FRECUENCIA_LABEL[f]}
                        </option>
                      ))}
                    </select>
                    <span>durante</span>
                    <Input
                      type="number"
                      min={2}
                      max={20}
                      value={fields.repetirVeces}
                      onChange={(e) => setFields((f) => ({ ...f, repetirVeces: e.target.value }))}
                      aria-label="Número de repeticiones"
                      className="w-16"
                    />
                    <span>veces</span>
                  </div>
                )}
              </div>
            )}

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
