"use client";

import { useEffect, useState } from "react";

function restantes(retryAt: number): number {
  return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
}

/**
 * Cuenta atrás real de un freno de intentos.
 *
 * El mensaje del servidor traía los segundos ya calculados y ahí se
 * quedaban: a los dos minutos seguía diciendo "espera 90s", así que quien lo
 * leía no sabía si tenía que esperar o si algo se había roto. Aquí se
 * descuentan de verdad, y al llegar a cero el texto cambia a "ya puedes
 * volver a intentarlo" en vez de quedarse en "0s".
 *
 * `retryAt` es un instante absoluto (epoch ms), no una duración: una
 * duración empieza a envejecer en cuanto sale del servidor, y basta con que
 * la respuesta tarde para que la cuenta atrás arranque ya desfasada.
 * Además, así un intento nuevo que devuelva "los mismos 90s" sigue
 * reiniciando la cuenta — con una duración serían props idénticas y la
 * cuenta se quedaría donde estaba.
 */
export function RetryCountdown({ retryAt }: { retryAt: number }) {
  const [restante, setRestante] = useState(() => restantes(retryAt));

  useEffect(() => {
    // Se recalcula desde el reloj en cada tic (en vez de restar uno) para
    // que no se quede atrás si el navegador ralentiza los temporizadores de
    // una pestaña en segundo plano.
    const t = setInterval(() => setRestante(restantes(retryAt)), 1000);
    return () => clearInterval(t);
  }, [retryAt]);

  if (restante <= 0) return <> Ya puedes volver a intentarlo.</>;

  const min = Math.floor(restante / 60);
  const seg = restante % 60;
  return <> Podrás volver a intentarlo en {min > 0 ? `${min}:${String(seg).padStart(2, "0")}` : `${seg}s`}.</>;
}
