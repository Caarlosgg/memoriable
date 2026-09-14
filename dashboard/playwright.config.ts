import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas end-to-end — navegador real, no mocks. Antes de esto, los ~840
 * tests de Vitest (unitarios/integración con mocks) no podían detectar que
 * un botón no se viera, que arrastrar una tarjeta no funcionara de verdad,
 * o que una pantalla se quedara en blanco — mismo hueco que el propio plan
 * de este proyecto llevaba señalando desde hace tiempo.
 *
 * IMPORTANTE — no hay base de datos de pruebas separada: `npm run dev`
 * usa el MISMO `DATABASE_URL` que producción (confirmado: no existe un
 * Postgres local para este proyecto). Por eso `e2e/public.spec.ts` son
 * deliberadamente de SOLO LECTURA (nunca inician sesión, nunca escriben
 * nada) — son las únicas que corren por defecto. Los flujos que necesitan
 * una cuenta de verdad (capturar una nota, mover una tarjeta, preguntar al
 * Asistente) están en `e2e/authenticated.spec.ts`, y se SALTAN solos salvo
 * que se les dé una cuenta de pruebas dedicada por variable de entorno —
 * ver el comentario al principio de ese fichero antes de activarlas.
 */
export default defineConfig({
  testDir: "./e2e",
  // NO en paralelo — verificado en vivo: con varios workers a la vez,
  // `next dev` (que compila cada ruta la primera vez que se pide, sobre
  // el pool limitado del pooler de Supabase en modo transacción) empieza
  // a dar timeouts de conexión que no ocurren en serie. 6/6 en serie,
  // hasta 4/6 fallidos en paralelo con 4 workers — no es un fallo de la
  // app, es el pool bajo carga concurrente que aquí no hace falta.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Levanta el propio `next dev` para la sesión de pruebas — nunca contra
  // producción. Puerto 3100, distinto del 3000 de siempre, para no chocar
  // con un `npm run dev` que ya se tuviera abierto a mano.
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
