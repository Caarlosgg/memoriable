"use client";

import { useSyncExternalStore } from "react";

const FECHA_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function saludoSegunHora(hora: number): string {
  if (hora < 6) return "Buenas noches";
  if (hora < 14) return "Buenos días";
  if (hora < 21) return "Buenas tardes";
  return "Buenas noches";
}

/**
 * El reloj del navegador, como fuente externa.
 *
 * `useSyncExternalStore` y no `useState` + `useEffect`: la hora local NO es
 * estado de React, es un dato que solo existe en el cliente y que hay que
 * leer en cada render sin provocar una cascada de renders. Además resuelve
 * la hidratación por diseño — `getServerSnapshot` devuelve `null`, así que
 * el HTML del servidor y el primer render del cliente coinciden siempre.
 */
let cache: { hora: number; texto: string } | null = null;

function subscribe(alCambiar: () => void): () => void {
  // Quien deja la pestaña abierta toda la noche no debería encontrarse
  // "Buenas tardes" por la mañana: se relee al volver a ella.
  const alVolver = () => {
    if (document.visibilityState === "visible") {
      cache = null;
      alCambiar();
    }
  };
  document.addEventListener("visibilitychange", alVolver);
  return () => document.removeEventListener("visibilitychange", alVolver);
}

/** Debe devolver SIEMPRE el mismo objeto si nada ha cambiado, o React entra en bucle. */
function getSnapshot(): { hora: number; texto: string } {
  if (!cache) {
    const ahora = new Date();
    cache = { hora: ahora.getHours(), texto: FECHA_FORMATTER.format(ahora) };
  }
  return cache;
}

function getServerSnapshot(): null {
  return null;
}

/**
 * Saludo y fecha de la pantalla de inicio, calculados en el CLIENTE.
 *
 * Se hacían en el servidor, y el servidor está en UTC: a la 01:30 de la
 * madrugada en España el reloj del servidor marcaba las 23:30 del día
 * anterior, así que te daba las "buenas noches" con la fecha de ayer. En
 * horario de verano, cualquier hora entre medianoche y las 2:00 salía en el
 * día equivocado.
 *
 * `nombre` sí viene del servidor: es un dato, no una hora.
 */
export function Saludo({ nombre }: { nombre?: string }) {
  const ahora = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">
        {/* `min-h` reserva el hueco: sin ella, el contenido de debajo salta
            hacia abajo en cuanto aparece el saludo. */}
        <span className="inline-block min-h-[1lh]">
          {ahora ? `${saludoSegunHora(ahora.hora)}${nombre ? `, ${nombre}` : ""}` : ""}
        </span>
      </h1>
      {/* first-letter:uppercase: Intl da el día en minúscula ("lunes, 18 de agosto"). */}
      <p className="min-h-[1lh] text-sm text-muted first-letter:uppercase">{ahora?.texto ?? ""}</p>
    </div>
  );
}
