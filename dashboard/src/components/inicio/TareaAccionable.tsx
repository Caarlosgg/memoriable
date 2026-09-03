"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CalendarClock, Loader2 } from "lucide-react";
import { updateTaskStatus, postponeMessage } from "@/app/(dashboard)/actions";
import { presentCategory } from "@/lib/categories";
import { useUndoToast } from "@/components/UndoToast";

/**
 * Fila de tarea de la pantalla de inicio que además SE PUEDE RESOLVER ahí
 * mismo: marcarla hecha o mandarla a mañana.
 *
 * Antes, Inicio solo informaba — veías "se te ha pasado: llamar al
 * fontanero" y para hacer algo tenías que ir al tablero, encontrarla otra
 * vez y entonces actuar. Para las dos acciones que cubren casi todos los
 * casos (ya está / hoy no puede ser), ese viaje sobra: la pantalla que te
 * enseña el problema es la que debe dejarte cerrarlo.
 *
 * Optimista y sin vuelta atrás visible: la fila desaparece al instante y
 * solo reaparece si el servidor rechaza el cambio (p. ej. rol de solo
 * lectura) — esperar la confirmación se nota lento en algo tan pequeño.
 */
export function TareaAccionable({
  id,
  resumen,
  categoria,
  urgente = false,
  puedeEditar,
}: {
  id: string;
  resumen: string;
  categoria: string;
  urgente?: boolean;
  /** VIEWER solo mira: sin esto los botones fallarían al pulsarlos (ver canWrite). */
  puedeEditar: boolean;
}) {
  const { Icon, color } = presentCategory(categoria);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [oculta, setOculta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useUndoToast();

  function ejecutar(accion: () => Promise<void>, confirmacion: string) {
    setError(null);
    setOculta(true);
    startTransition(async () => {
      try {
        await accion();
        // La fila desaparece al instante, así que sin esto nada confirma
        // que la acción se haya guardado de verdad — solo se ve algo
        // esfumarse. El toast es la señal que faltaba.
        toast(confirmacion);
        // Refresca las CIFRAS de arriba además de la lista: dejar "Vencidas
        // 3" cuando acabas de cerrar una es justo la incoherencia que hace
        // desconfiar del panel.
        router.refresh();
      } catch (err) {
        console.error("No se pudo actualizar la tarea desde Inicio:", err);
        setOculta(false);
        setError(err instanceof Error ? err.message : "No se ha podido guardar.");
      }
    });
  }

  function marcarHecha() {
    ejecutar(() => updateTaskStatus(id, "HECHO"), "Hecho");
  }

  function aplazarAManana() {
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    manana.setHours(9, 0, 0, 0);
    ejecutar(() => postponeMessage(id, manana), "Aplazada a mañana");
  }

  if (oculta && !error) return null;

  return (
    <li className="group flex items-start gap-2 py-1 text-sm">
      <Icon aria-hidden size={14} className={`mt-0.5 shrink-0 ${urgente ? "text-danger" : color}`} />
      <span className={`min-w-0 flex-1 ${urgente ? "text-danger" : "text-ink"}`}>
        {resumen}
        {error && <span className="mt-0.5 block text-xs text-danger">{error}</span>}
      </span>
      {puedeEditar && (
        // Siempre visibles en táctil (donde no hay hover), discretos hasta
        // pasar el ratón en escritorio — mismo criterio que el botón de
        // borrar del chat, por el mismo motivo: en el móvil, esconder algo
        // tras un hover es esconderlo del todo.
        <span className="flex shrink-0 gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          {pending ? (
            <Loader2 aria-hidden size={14} className="m-1.5 animate-spin text-muted motion-reduce:animate-none" />
          ) : (
            <>
              <button
                type="button"
                onClick={marcarHecha}
                aria-label={`Marcar como hecha: ${resumen}`}
                title="Marcar como hecha"
                className="rounded-full p-1.5 text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              >
                <Check aria-hidden size={14} />
              </button>
              <button
                type="button"
                onClick={aplazarAManana}
                aria-label={`Aplazar a mañana: ${resumen}`}
                title="Aplazar a mañana"
                className="rounded-full p-1.5 text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              >
                <CalendarClock aria-hidden size={14} />
              </button>
            </>
          )}
        </span>
      )}
    </li>
  );
}
