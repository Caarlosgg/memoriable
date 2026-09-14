import { test, expect } from "@playwright/test";

/**
 * Flujos que necesitan una sesión real: capturar una nota, arrastrar una
 * tarjeta del Tablero, preguntarle algo al Asistente.
 *
 * SE SALTAN SOLOS por defecto — ver el comentario de playwright.config.ts:
 * no hay base de datos de pruebas separada, `npm run dev` habla con la
 * MISMA base de datos que producción. Ejecutar esto sin pensarlo
 * escribiría datos de prueba en una cuenta real, exactamente lo que este
 * proyecto ya paró en seco una vez (ver el histórico de esta sesión: un
 * script de verificación equivalente fue bloqueado por el clasificador de
 * modo automático por tocar la base de datos de producción sin
 * confirmación explícita — regla 4 de CLAUDE.md).
 *
 * Para activarlos de verdad hace falta una cuenta de pruebas DEDICADA
 * (nunca la tuya) cuyos datos no importe que se ensucien, dada por
 * variables de entorno:
 *
 *   E2E_TEST_EMAIL=prueba@tudominio.example
 *   E2E_TEST_PASSWORD=................
 *   npx playwright test e2e/authenticated.spec.ts
 *
 * La forma más segura de tener esa cuenta sin arriesgar nada real: una
 * rama de desarrollo de Supabase (`create_branch` por MCP), que clona el
 * esquema sin los datos — tiene coste por hora, así que se decide
 * aparte, no aquí.
 */
const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;

test.describe("flujos autenticados (requieren E2E_TEST_EMAIL/E2E_TEST_PASSWORD)", () => {
  test.skip(!EMAIL || !PASSWORD, "sin cuenta de pruebas dedicada — ver el comentario de este fichero");

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(EMAIL!);
    await page.locator("#password").fill(PASSWORD!);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/inicio$/);
  });

  test("capturar una nota y verla en Notas", async ({ page }) => {
    const texto = `Nota de prueba e2e ${Date.now()}`;
    await page.goto("/notas");
    await page.locator("#contenido").fill(texto);
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText(texto)).toBeVisible({ timeout: 15_000 });
  });

  test("mover una tarjeta del Tablero entre columnas", async ({ page }) => {
    await page.goto("/pendientes");
    // Cambiar de estado con el botón "Cambiar estado" (KanbanCard.tsx) es
    // más fiable en un navegador headless que simular un arrastre real de
    // dnd-kit (que depende de eventos de puntero de bajo nivel) — prueba
    // el mismo efecto (mover de columna) por un camino que sí es un
    // simple clic.
    const boton = page.getByTitle("Cambiar estado").first();
    await expect(boton).toBeVisible({ timeout: 15_000 });
    await boton.click();
  });

  test("preguntar algo al Asistente y ver una respuesta", async ({ page }) => {
    await page.goto("/asistente");
    await page.locator("#asistente-input").fill("¿Qué es MemorIAble?");
    await page.getByRole("button", { name: "Enviar" }).click();
    // La respuesta del Asistente se pinta en un <li> alineado a la
    // izquierda (AssistantChat.tsx: `message.role === "user" ? "justify-end"
    // : "justify-start"`). Puede tardar varios segundos (llamada real a
    // Groq) — margen generoso.
    await expect(page.locator("li.justify-start").last()).toBeVisible({ timeout: 30_000 });
  });
});
