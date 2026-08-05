"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Undo2 } from "lucide-react";

/** Margen antes de que un borrado se haga de verdad — tiempo de sobra para arrepentirse sin sentirse eterno. */
const DEFAULT_DELAY_MS = 5000;

export interface ScheduleDeleteOptions {
  /** Texto del toast, p. ej. "Nota eliminada". */
  label: string;
  /** Se llama cuando pasa el margen sin deshacer — aquí va el borrado real (server action). */
  onConfirm: () => Promise<void> | void;
  /** Se llama si el usuario pulsa "Deshacer" — nada se llegó a borrar, solo hay que devolver la UI a como estaba. */
  onUndo?: () => void;
  delayMs?: number;
}

interface ActiveToast {
  id: string;
  label: string;
  onUndo?: () => void;
  timer: ReturnType<typeof setTimeout>;
}

interface UndoToastContextValue {
  scheduleDelete: (options: ScheduleDeleteOptions) => void;
}

const UndoToastContext = createContext<UndoToastContextValue | null>(null);

/** Para nota/tarea/evento: programar un borrado con margen de deshacer, ver UndoToast.tsx. */
export function useUndoToast(): UndoToastContextValue {
  const ctx = useContext(UndoToastContext);
  if (!ctx) throw new Error("useUndoToast debe usarse dentro de <UndoToastProvider>.");
  return ctx;
}

/**
 * Borrados con margen: en vez de borrar al instante, la UI oculta el
 * elemento YA (lo decide quien llama a `scheduleDelete`, vía `onUndo`
 * como única señal de "no borrar") y programa el borrado real para dentro
 * de unos segundos. Un solo sitio (montado en el layout del dashboard)
 * para que el toast sobreviva a cualquier navegación mientras cuenta.
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
    const toast: ActiveToast = { id, label: options.label, onUndo: options.onUndo, timer };
    toastsRef.current = [...toastsRef.current, toast];
    setToasts((prev) => [...prev, toast]);
  }, []);

  function handleUndo(toast: ActiveToast) {
    clearTimeout(toast.timer);
    toastsRef.current = toastsRef.current.filter((t) => t.id !== toast.id);
    setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    toast.onUndo?.();
  }

  return (
    <UndoToastContext.Provider value={{ scheduleDelete }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="fade-in pointer-events-auto flex items-center gap-3 rounded-full border border-paper-line bg-paper-raised py-2 pr-2 pl-4 text-sm text-ink shadow-[0_12px_28px_-16px_rgba(28,27,24,0.45)]"
          >
            <span>{toast.label}</span>
            <button
              type="button"
              onClick={() => handleUndo(toast)}
              className="flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong transition-colors hover:bg-accent hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Undo2 aria-hidden size={13} /> Deshacer
            </button>
          </div>
        ))}
      </div>
    </UndoToastContext.Provider>
  );
}
