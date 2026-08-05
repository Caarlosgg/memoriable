import * as Sentry from "@sentry/nextjs";

/**
 * Observabilidad en producción (servidor): hoy los errores solo quedan en
 * `console.error`, invisibles fuera de los logs de Vercel. Sin SENTRY_DSN
 * (pendiente de crear la cuenta), `Sentry.init` con `dsn: undefined` es un
 * no-op documentado del SDK — no lanza, no intenta conectar, el resto de
 * la app sigue funcionando exactamente igual (mismo criterio de "variable
 * opcional que no rompe nada" que el resto del proyecto).
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
