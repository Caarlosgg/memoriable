import * as Sentry from "@sentry/nextjs";

/**
 * Observabilidad en el navegador. Necesita el prefijo NEXT_PUBLIC_ (a
 * diferencia de sentry.server.config.ts): esto se ejecuta en el bundle del
 * cliente, así que la variable tiene que estar expuesta a propósito.
 *
 * A propósito SIN `replayIntegration`/`feedbackIntegration` (lo que trae
 * el asistente de instalación por defecto): Session Replay graba capturas
 * de la pantalla del usuario, y esta app muestra notas privadas — activar
 * grabación de sesión por defecto sería capturar ese contenido sin haberlo
 * decidido conscientemente. Si algún día se quiere, que sea una decisión
 * aparte, no un efecto colateral de instalar Sentry.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
