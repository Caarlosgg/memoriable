import type { NextConfig } from "next";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Este repo tiene otro package-lock.json en la raíz (el bot de Telegram).
  // Fija explícitamente la raíz para que Turbopack no intente adivinarla.
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    serverActions: {
      /**
       * Las peticiones de Server Action van capadas a 1 MB por defecto
       * (ver node_modules/next/dist/docs/01-app/02-guides/server-actions.md),
       * pero `blobUpload.ts` valida hasta 8 MB de imagen. Es decir: cualquier
       * captura de pantalla de más de 1 MB —una de un monitor grande lo pasa
       * de sobra— ya fallaba con un error opaco del framework ANTES de llegar
       * a nuestra validación, y el usuario solo veía que "no se puede subir".
       *
       * 10 MB = los 8 MB que de verdad admitimos + el margen que se lleva la
       * codificación multipart del formulario.
       */
      bodySizeLimit: "10mb",
    },
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
