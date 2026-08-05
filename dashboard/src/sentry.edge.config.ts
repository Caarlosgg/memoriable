import * as Sentry from "@sentry/nextjs";

/** Ver sentry.server.config.ts — misma inicialización, para el runtime edge (proxy.ts). */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
