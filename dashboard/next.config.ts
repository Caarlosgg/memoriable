import type { NextConfig } from "next";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Este repo tiene otro package-lock.json en la raíz (el bot de Telegram).
  // Fija explícitamente la raíz para que Turbopack no intente adivinarla.
  turbopack: {
    root: path.join(__dirname),
  },
};

// Sentry (observabilidad, ver instrumentation.ts/sentry.*.config.ts): solo
// envuelve la config si hay un proyecto de Sentry configurado (SENTRY_ORG +
// SENTRY_PROJECT). Sin ellos —pendiente de crear la cuenta— el build usa la
// config de siempre, sin tocar nada ni depender de ningún secreto.
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;

export default sentryOrg && sentryProject
  ? withSentryConfig(nextConfig, {
      org: sentryOrg,
      project: sentryProject,
      // Sube source maps solo si hay token de auth (evita que un build
      // local sin credenciales de Sentry falle intentando subirlos).
      silent: !process.env.CI,
      disableLogger: true,
    })
  : nextConfig;
