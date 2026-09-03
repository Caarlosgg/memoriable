"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Undo2, Check, TriangleAlert, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** Margen antes de que un borrado se haga de verdad — tiempo de sobra para arrepentirse sin sentirse eterno. */
const DEFAULT_DELAY_MS = 5000;
/** Cuánto dura en pantalla un aviso normal (sin acción que esperar). */
const DEFAULT_TOAST_MS = 4000;

export interface ScheduleDeleteOptions {
  /** Texto del toast, p. ej. "Nota eliminada". */
  label: string;
  /** Se llama cuando pasa el margen sin deshacer — aquí va el borrado real (server action). */
  onConfirm: () => Promise<void> | void;
  /** Se llama si el usuario pulsa "Deshacer" — nada se llegó a borrar, solo hay que devolver la UI a como estaba. */
  onUndo?: () => void;
  delayMs?: number;
}

export type ToastTone = "success" | "error" | "info";

interface ActiveToast {
  id: string;
  label: string;
  /** Presente solo en los toasts de borrado: es lo que pinta el botón "Deshacer". */
  onUndo?: () => void;
  tone: ToastTone;
  timer: ReturnType<typeof setTimeout>;
}

interface UndoToastContextValue {
  scheduleDelete: (options: ScheduleDeleteOptions) => void;
  /** Aviso corto sin acción: confirma que algo ha pasado (o que ha fallado). */
  toast: (label: string, tone?: ToastTone) => void;
}

const UndoToastContext = createContext<UndoToastContextValue | null>(null);

/** Toasts de la app: borrado con margen de deshacer, y avisos cortos. Ver UndoToast.tsx. */
export function useUndoToast(): UndoToastContextValue {
  const ctx = useContext(UndoToastContext);
  if (!ctx) throw new Error("useUndoToast debe usarse dentro de <UndoToastProvider>.");
  return ctx;
}

const TONE_ICON: Record<ToastTone, typeof Check> = {
  success: Check,
  error: TriangleAlert,
  info: Info,
};

const TONE_CLASS: Record<ToastTone, string> = {
  success: "text-accent-strong",
  error: "text-danger",
  info: "text-muted",
};

/**
 * Toasts de la aplicación, en un solo sitio (montado en el layout del
 * dashboard) para que sobrevivan a cualquier navegación.
 *
 * Dos usos:
 *
 * - `scheduleDelete`: borrados con margen. En vez de borrar al instante, la
 *   UI oculta el elemento YA (lo decide quien llama, vía `onUndo` como única
 *   señal de "no borrar") y programa el borrado real para dentro de unos
 *   segundos.
 * - `toast`: aviso corto que confirma una acción. Antes no existía —
 *   completar una tarea o guardar un cambio no devolvía ninguna señal
 *   visible, que es parte de por qué la app se sentía muerta.
 */
export function UndoToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  // Espejo mutable de `toasts`, actualizado en los mismos sitios que
  // `setToasts` (nunca leído durante el render) — solo para poder limpiar
  // temporizadores al desmontar sin depender de un efecto que sincronice
  // estado, que además dispararía el lint de "no leer refs en el render".
  const toastsRef = useRef<ActiveToast[]>([]);

  useEffect(() => {
    return () => {
      for (const t of toastsRef.current) clearTimeout(t.timer);
    };
  }, []);

  const scheduleDelete = useCallback((options: ScheduleDeleteOptions) => {
    const id = crypto.randomUUID();
    const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
    const timer = setTimeout(() => {
      toastsRef.current = toastsRef.current.filter((t) => t.id !== id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
      Promise.resolve(options.onConfirm()).catch((err) => {
        console.error("No se ha podido completar el borrado tras el margen de deshacer:", err);
      });
    }, delayMs);
    const toast: ActiveToast = { id, label: options.label, onUndo: options.onUndo, tone: "info", timer };
    toastsRef.current = [...toastsRef.current, toast];
    setToasts((prev) => [...prev, toast]);
  }, []);

  const toast = useCallback((label: string, tone: ToastTone = "success") => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      toastsRef.current = toastsRef.current.filter((t) => t.id !== id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DEFAULT_TOAST_MS);
    const entry: ActiveToast = { id, label, tone, timer };
    toastsRef.current = [...toastsRef.current, entry];
    setToasts((prev) => [...prev, entry]);
  }, []);

  function handleUndo(entry: ActiveToast) {
    clearTimeout(entry.timer);
    toastsRef.current = toastsRef.current.filter((t) => t.id !== entry.id);
    setToasts((prev) => prev.filter((t) => t.id !== entry.id));
    entry.onUndo?.();
  }

  return (
    <UndoToastContext.Provider value={{ scheduleDelete, toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6"
      >
        {toasts.map((entry) => {
          const Icon = TONE_ICON[entry.tone];
          // Solo los borrados traen `onUndo`; el resto son avisos con icono.
          const esBorrado = entry.onUndo !== undefined;
          return (
            <div
              key={entry.id}
              role="status"
              className={cn(
                "toast-in pointer-events-auto flex items-center gap-3 rounded-full border border-paper-line bg-paper-raised py-2 pl-4 text-sm text-ink shadow-md",
                esBorrado ? "pr-2" : "pr-4",
              )}
            >
              {!esBorrado && <Icon aria-hidden size={15} className={TONE_CLASS[entry.tone]} />}
              <span>{entry.label}</span>
              {esBorrado && (
                <button
                  type="button"
                  onClick={() => handleUndo(entry)}
                  className="flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong transition-colors duration-fast hover:bg-accent hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Undo2 aria-hidden size={13} /> Deshacer
                </button>
              )}
            </div>
          );
        })}
      </div>
    </UndoToastContext.Provider>
  );
}
