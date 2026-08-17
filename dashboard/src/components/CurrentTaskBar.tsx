"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleCheck, Square, Loader2 } from "lucide-react";
import { listEnProgresoAhora, stopWorkingOn, updateTaskStatus, type EnProgresoItem } from "@/app/(dashboard)/actions";
import { presentCategory } from "@/lib/categories";
import { shortEmailName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EN_PROGRESO_CHANGED_EVENT, notifyTaskPatchedElsewhere } from "@/lib/enProgresoEvents";
import { useVisibilityAwarePolling } from "@/lib/useVisibilityAwarePolling";

/**
 * Sondeo corto (no WebSocket/SSE — no hay infraestructura de tiempo real en
 * esta app, y Vercel serverless no sostiene conexiones persistentes) para
 * que "en curso ahora" se sienta compartido en vivo con el resto del
 * equipo sin depender de que alguien navegue o refresque la página. 20s es
 * un compromiso razonable: bastante ágil para notar que un compañero ha
 * empezado algo, sin generar tráfico constante de fondo.
 */
const POLL_MS = 20000;

function elapsedLabel(desde: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(desde).getTime()) / 60000));
  if (mins < 1) return "justo ahora";
  if (mins < 60) return `hace ${mins} min`;
  return `hace ${Math.round(mins / 60)} h`;
}

/**
 * Indicador persistente de "en curso ahora" (Fase Equipo): tu propia
 * tarjeta activa (con acciones rápidas para no tener que ir al Tablero) y,
 * si hay equipo, quién más está trabajando en algo ahora mismo. Vive en el
 * layout (no en /tablero) para verse desde cualquier pantalla — el pedido
 * explícito era "que se vea en el dashboard... en segundo plano". Si no hay
 * nada en curso (ni tuyo ni del equipo), no pinta nada: no tiene sentido
 * ocupar sitio de forma permanente por una función que en ese momento no
 * se está usando.
 */
export function CurrentTaskBar({
  currentUserId,
  memberEmailById,
}: {
  currentUserId: string;
  /** Email por userId de los miembros del workspace activo — para nombrar a quien está "en curso". Vacío en modo personal. */
  memberEmailById: Record<string, string>;
}) {
  const [items, setItems] = useState<EnProgresoItem[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    listEnProgresoAhora()
      .then(setItems)
      .catch((err) => console.error("No se pudo consultar «en curso ahora» (no crítico):", err));
  }, []);

  useVisibilityAwarePolling(refresh, POLL_MS);

  useEffect(() => {
    // Cambios hechos por TI en esta misma pestaña (botones de la tarjeta
    // del tablero) se notan al instante, sin esperar al sondeo — ver
    // lib/enProgresoEvents.ts.
    window.addEventListener(EN_PROGRESO_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(EN_PROGRESO_CHANGED_EVENT, refresh);
  }, [refresh]);

  const mine = items.find((i) => i.enProgresoPorId === currentUserId);
  const others = items.filter((i) => i.enProgresoPorId !== currentUserId);

  if (!mine && others.length === 0) return null;

  async function handleDone() {
    if (!mine) return;
    setBusy(true);
    setItems((prev) => prev.filter((i) => i.id !== mine.id));
    try {
      await updateTaskStatus(mine.id, "HECHO");
      // El tablero (si está montado en otra parte de esta misma pestaña) no
      // se entera solo con `revalidatePath` — lleva su propia copia local
      // optimista, así que hay que avisarle también aquí.
      notifyTaskPatchedElsewhere({
        messageId: mine.id,
        patch: { estado: "HECHO", hecho: true, enProgresoPorId: null, enProgresoDesde: null },
      });
    } catch (err) {
      console.error("No se pudo marcar como hecha:", err);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    if (!mine) return;
    setBusy(true);
    setItems((prev) => prev.filter((i) => i.id !== mine.id));
    try {
      await stopWorkingOn(mine.id);
      notifyTaskPatchedElsewhere({ messageId: mine.id, patch: { enProgresoPorId: null, enProgresoDesde: null } });
    } catch (err) {
      console.error("No se pudo soltar la tarea:", err);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="status"
      aria-label="En curso ahora"
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-80"
    >
      <div className="fade-in flex flex-col gap-2 rounded-2xl border border-accent/30 bg-paper-raised p-3 shadow-lg">
        {mine && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-ink">{mine.resumen}</p>
              <p className="text-[11px] text-muted">Trabajando · {elapsedLabel(mine.enProgresoDesde)}</p>
            </div>
            {busy ? (
              <Loader2 aria-hidden size={16} className="animate-spin text-muted" />
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleDone}
                  title="Marcar hecha"
                  aria-label="Marcar esta tarea como hecha"
                  className="rounded-full p-1 text-accent transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <CircleCheck aria-hidden size={18} />
                </button>
                <button
                  type="button"
                  onClick={handleStop}
                  title="Dejar de trabajar en esto"
                  aria-label="Dejar de trabajar en esta tarea"
                  className="rounded-full p-1 text-muted transition-colors hover:bg-paper-line/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Square aria-hidden size={14} />
                </button>
              </>
            )}
          </div>
        )}
        {others.length > 0 && (
          <ul className={cn("flex flex-col gap-1", mine && "border-t border-paper-line pt-1.5")}>
            {others.slice(0, 4).map((item) => {
              const { Icon, color } = presentCategory(item.categoria);
              return (
                <li key={item.id} className="flex items-center gap-1.5 truncate text-[11px] text-muted">
                  <Icon aria-hidden size={11} className={color} />
                  <span className="font-medium text-ink">{shortEmailName(memberEmailById[item.enProgresoPorId] ?? "alguien")}</span>
                  <span className="truncate">en curso: {item.resumen}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
