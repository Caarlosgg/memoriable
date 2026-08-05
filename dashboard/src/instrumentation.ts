import * as Sentry from "@sentry/nextjs";

/** Registro de Sentry para servidor/edge — Next.js llama a `register()` una vez al arrancar. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/** Captura automática de errores no controlados en rutas/Server Actions (además de los que se capturan a mano, ver comentarios "Sentry.captureException" en el código). */
export const onRequestError = Sentry.captureRequestError;
