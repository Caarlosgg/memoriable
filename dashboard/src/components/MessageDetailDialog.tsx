"use client";

import { useRef, useState, useTransition, type ReactNode, type ClipboardEvent, type ChangeEvent } from "react";
import type { Message } from "@prisma/client";
import { Pencil, Clock, Tag, X, Plus, Trash2, ImagePlus, ListChecks } from "lucide-react";
import { presentCategory, CATEGORIES, CATEGORY_PRESENTATION } from "@/lib/categories";
import { ESTADO_PRESENTATION, ESTADOS_TABLERO, PRIORIDADES, PRIORIDAD_PRESENTATION } from "@/lib/kanban";
import { formatDate } from "@/lib/format";
import { updateMessage, deleteMessage, uploadImage } from "@/app/(dashboard)/actions";
import { camposExtraToArray, camposExtraToJson, type CampoExtra, type CamposExtraJson } from "@/lib/camposExtra";
import { checklistToArray, checklistToJson, type ChecklistItem } from "@/lib/checklist";
import { cn } from "@/lib/utils";
import { useUndoToast } from "./UndoToast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

/** Mismas clases que el select de categoría en NotesExplorer.tsx, para que todos los selects se vean igual. */
const SELECT_CLASSNAME =
  "rounded-lg border border-paper-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40";

export interface EditableFields {
  resumen: string;
  contenido: string;
  categoria: string;
  estado: Message["estado"];
  prioridad: Message["prioridad"];
  etiquetas: string[];
  camposExtra: CamposExtraJson;
  checklist: ChecklistItem[];
  imagenes: string[];
}

function fieldsFrom(message: Message): EditableFields {
  return {
    resumen: message.resumen,
    contenido: message.contenido,
    categoria: message.categoria,
    estado: message.estado,
    prioridad: message.prioridad,
    etiquetas: message.etiquetas,
    camposExtra: message.camposExtra as CamposExtraJson,
    checklist: checklistToArray(message.checklist),
    imagenes: message.imagenes,
  };
}

function parseEtiquetas(texto: string): string[] {
  return texto
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
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
  onSaved,
  onDeleted,
  onUndoDelete,
}: {
  message: Message;
  /** Lo que abre el modal al hacer clic — se envuelve con `DialogTrigger asChild`. */
  children: ReactNode;
  /** Abre directamente en modo edición (usado desde el tablero, Fase C). */
  defaultEditing?: boolean;
  /**
   * Se llama tras guardar con éxito, con los campos editados. El tablero
   * (Fase C) lo usa para actualizar su estado local al vuelo — sin esto la
   * tarjeta no se movería de columna hasta un refresco de página, porque
   * `revalidatePath` no toca el estado de un Client Component ya montado
   * (a diferencia de la vista agrupada de Notas, que parte de un Server
   * Component y se refresca sola).
   */
  onSaved?: (id: string, patch: EditableFields) => void;
  /** Se llama AL INSTANTE al pulsar "Borrar" — el padre debe ocultar la tarjeta ya, antes de que el borrado real ocurra. */
  onDeleted?: (id: string) => void;
  /** Se llama si el usuario pulsa "Deshacer" en el toast — el padre debe volver a mostrar la tarjeta. */
  onUndoDelete?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { scheduleDelete } = useUndoToast();
  const [editing, setEditing] = useState(defaultEditing);
  const [fields, setFields] = useState<EditableFields>(() => fieldsFrom(message));
  // Aparte de `fields`: un array derivado de un `<input>` de texto en cada
  // pulsación se pisaría a sí mismo justo después de escribir una coma (el
  // valor mostrado se "recompone" sin la coma recién tecleada). Se guarda
  // el texto tal cual y solo se parte en etiquetas al guardar.
  const [etiquetasTexto, setEtiquetasTexto] = useState(() => message.etiquetas.join(", "));
  const [camposExtraRows, setCamposExtraRows] = useState<CampoExtra[]>(() => camposExtraToArray(message.camposExtra));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Cada apertura arranca desde los datos actuales, por si la nota se
      // editó en otra pestaña/vista entre un cierre y la siguiente apertura.
      setFields(fieldsFrom(message));
      setEtiquetasTexto(message.etiquetas.join(", "));
      setCamposExtraRows(camposExtraToArray(message.camposExtra));
      setEditing(defaultEditing);
      setError(null);
      setUploadError(null);
    }
  }

  function handleCancel() {
    setFields(fieldsFrom(message));
    setEtiquetasTexto(message.etiquetas.join(", "));
    setCamposExtraRows(camposExtraToArray(message.camposExtra));
    setError(null);
    setUploadError(null);
    setEditing(false);
  }

  /** Sube un fichero (dropzone o Ctrl+V) y lo añade a las imágenes de la nota. */
  async function handleUpload(file: File) {
    setUploadError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadImage(formData);
      if (result.error || !result.url) {
        setUploadError(result.error ?? "No se ha podido subir la imagen.");
        return;
      }
      setFields((f) => ({ ...f, imagenes: [...f.imagenes, result.url!] }));
    } finally {
      setUploading(false);
    }
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void handleUpload(file);
  }

  /** Pegar una captura de pantalla (Ctrl+V) sube la imagen igual que arrastrarla. */
  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (file) void handleUpload(file);
  }

  function removeImagen(url: string) {
    setFields((f) => ({ ...f, imagenes: f.imagenes.filter((u) => u !== url) }));
  }

  function updateCampoExtra(index: number, patch: Partial<CampoExtra>) {
    setCamposExtraRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeCampoExtra(index: number) {
    setCamposExtraRows((rows) => rows.filter((_, i) => i !== index));
  }

  function addCampoExtra() {
    setCamposExtraRows((rows) => [...rows, { nombre: "", tipo: "texto", valor: "" }]);
  }

  /** El array ES la forma de guardado (a diferencia de camposExtra, que es un diccionario) — se edita `fields.checklist` directamente. */
  function addChecklistItem() {
    setFields((f) => ({ ...f, checklist: [...f.checklist, { id: crypto.randomUUID(), texto: "", hecho: false }] }));
  }

  function updateChecklistItem(id: string, patch: Partial<Pick<ChecklistItem, "texto" | "hecho">>) {
    setFields((f) => ({ ...f, checklist: f.checklist.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
  }

  function removeChecklistItem(id: string) {
    setFields((f) => ({ ...f, checklist: f.checklist.filter((item) => item.id !== id) }));
  }

  /**
   * Marcar un punto de la checklist en modo VISTA (no editing): guardado
   * inmediato, sin pasar por "Editar"/"Guardar" — mismo criterio que los
   * botones de estado/prioridad de la tarjeta del tablero. Una checklist
   * es para ir tachando sobre la marcha; obligar a entrar en edición por
   * cada marca sería justo la fricción que el checklist quiere evitar.
   */
  function handleQuickToggleChecklist(itemId: string) {
    const current = checklistToArray(message.checklist);
    const updated = current.map((item) => (item.id === itemId ? { ...item, hecho: !item.hecho } : item));
    updateMessage(message.id, { checklist: updated })
      .then((result) => {
        if (result.error) {
          console.error("No se pudo actualizar la checklist:", result.error);
          return;
        }
        onSaved?.(message.id, { ...fieldsFrom(message), checklist: updated });
      })
      .catch((err) => console.error("No se pudo actualizar la checklist:", err));
  }

  function handleSave() {
    setError(null);
    const patch: EditableFields = {
      ...fields,
      etiquetas: parseEtiquetas(etiquetasTexto),
      camposExtra: camposExtraToJson(camposExtraRows),
      checklist: checklistToJson(fields.checklist),
    };
    startTransition(async () => {
      const result = await updateMessage(message.id, patch);
      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved?.(message.id, patch);
      setEditing(false);
    });
  }

  /**
   * Borrado con margen de deshacer (Tier 1.3): oculta la tarjeta y cierra
   * el modal de inmediato, y programa el borrado real en el servidor para
   * dentro de unos segundos — si el usuario pulsa "Deshacer" en el toast,
   * `onUndoDelete` la vuelve a mostrar y `deleteMessage` nunca se llama.
   */
  function handleDelete() {
    setOpen(false);
    onDeleted?.(message.id);
    scheduleDelete({
      label: `«${message.resumen || "Nota"}» eliminada`,
      onUndo: () => onUndoDelete?.(message.id),
      onConfirm: async () => {
        const result = await deleteMessage(message.id);
        if (result.error) {
          console.error("No se pudo completar el borrado de la nota:", result.error);
          onUndoDelete?.(message.id);
        }
      },
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
            {message.imagenes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {message.imagenes.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element -- Blob URLs son públicas, no hace falta el optimizador de next/image.
                  <img key={url} src={url} alt="" className="h-20 w-20 rounded-lg border border-paper-line object-cover" />
                ))}
              </div>
            )}
            {message.etiquetas.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {message.etiquetas.map((tag) => (
                  <li
                    key={tag}
                    className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-strong"
                  >
                    <Tag aria-hidden size={10} /> {tag}
                  </li>
                ))}
              </ul>
            )}
            {camposExtraToArray(message.camposExtra).length > 0 && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-paper-line pt-3 text-xs">
                {camposExtraToArray(message.camposExtra).map((campo) => (
                  <div key={campo.nombre} className="contents">
                    <dt className="text-muted">{campo.nombre}</dt>
                    <dd className="text-ink">{campo.valor || "—"}</dd>
                  </div>
                ))}
              </dl>
            )}
            {checklistToArray(message.checklist).length > 0 && (
              <div className="flex flex-col gap-1.5 border-t border-paper-line pt-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <ListChecks aria-hidden size={13} />
                  {checklistToArray(message.checklist).filter((i) => i.hecho).length}/
                  {checklistToArray(message.checklist).length} hechos
                </p>
                <ul className="flex flex-col gap-1">
                  {checklistToArray(message.checklist).map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleQuickToggleChecklist(item.id)}
                        className="flex w-full items-center gap-2 rounded-lg p-1 text-left text-sm transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <input type="checkbox" checked={item.hecho} readOnly className="h-4 w-4 rounded border-paper-line accent-accent" />
                        <span className={cn(item.hecho ? "text-muted line-through" : "text-ink")}>{item.texto}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-paper-line pt-3 text-xs text-muted">
              <span className="flex items-center gap-1">
                <Clock aria-hidden size={12} /> {formatDate(message.fecha)}
              </span>
              <span>{ESTADO_PRESENTATION[message.estado].label}</span>
              <span>Prioridad {PRIORIDAD_PRESENTATION[message.prioridad].label}</span>
            </div>
            <DialogFooter className="mt-0 justify-between sm:justify-between">
              <Button type="button" variant="outline" onClick={handleDelete} className="text-danger">
                <Trash2 aria-hidden size={15} /> Borrar
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
                <Pencil aria-hidden size={15} /> Editar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4" onPaste={handlePaste}>
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

            <div className="flex flex-col gap-1.5">
              <label htmlFor="detalle-etiquetas" className="text-sm font-medium text-ink">
                Etiquetas
              </label>
              <Input
                id="detalle-etiquetas"
                value={etiquetasTexto}
                onChange={(e) => setEtiquetasTexto(e.target.value)}
                placeholder="separadas por comas: viaje, urgente, casa…"
              />
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-ink">Campos extra</p>
              {camposExtraRows.map((campo, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={campo.nombre}
                    onChange={(e) => updateCampoExtra(i, { nombre: e.target.value })}
                    placeholder="Nombre"
                    aria-label={`Nombre del campo extra ${i + 1}`}
                    className="flex-1"
                  />
                  <select
                    value={campo.tipo}
                    onChange={(e) => updateCampoExtra(i, { tipo: e.target.value as CampoExtra["tipo"] })}
                    aria-label={`Tipo del campo extra ${i + 1}`}
                    className={`${SELECT_CLASSNAME} shrink-0`}
                  >
                    <option value="texto">Texto</option>
                    <option value="numero">Número</option>
                    <option value="fecha">Fecha</option>
                  </select>
                  <Input
                    type={campo.tipo === "numero" ? "number" : campo.tipo === "fecha" ? "date" : "text"}
                    value={campo.valor}
                    onChange={(e) => updateCampoExtra(i, { valor: e.target.value })}
                    placeholder="Valor"
                    aria-label={`Valor del campo extra ${i + 1}`}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => removeCampoExtra(i)}
                    aria-label={`Quitar el campo extra ${i + 1}`}
                    className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                  >
                    <X aria-hidden size={16} />
                  </button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={addCampoExtra} className="self-start">
                <Plus aria-hidden size={14} /> Añadir campo
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-ink">Checklist</p>
              {fields.checklist.map((item, i) => (
                <div key={item.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.hecho}
                    onChange={(e) => updateChecklistItem(item.id, { hecho: e.target.checked })}
                    aria-label={`Marcar como hecho el punto ${i + 1}`}
                    className="h-4 w-4 shrink-0 rounded border-paper-line accent-accent"
                  />
                  <Input
                    value={item.texto}
                    onChange={(e) => updateChecklistItem(item.id, { texto: e.target.value })}
                    placeholder="Punto de la checklist"
                    aria-label={`Texto del punto ${i + 1}`}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => removeChecklistItem(item.id)}
                    aria-label={`Quitar el punto ${i + 1}`}
                    className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                  >
                    <X aria-hidden size={16} />
                  </button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={addChecklistItem} className="self-start">
                <Plus aria-hidden size={14} /> Añadir punto
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-ink">Imágenes</p>
              {fields.imagenes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {fields.imagenes.map((url) => (
                    <div key={url} className="group relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- Blob URLs son públicas, no hace falta el optimizador de next/image. */}
                      <img src={url} alt="" className="h-20 w-20 rounded-lg border border-paper-line object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImagen(url)}
                        aria-label="Quitar esta imagen"
                        className="absolute -top-1.5 -right-1.5 rounded-full bg-paper-raised p-1 text-muted shadow-sm transition-colors hover:bg-danger-soft hover:text-danger focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                      >
                        <X aria-hidden size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="self-start"
              >
                <ImagePlus aria-hidden size={14} />
                {uploading ? "Subiendo…" : "Añadir imagen (o pega con Ctrl+V)"}
              </Button>
              {uploadError && (
                <p role="alert" className="text-xs text-danger">
                  {uploadError}
                </p>
              )}
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
