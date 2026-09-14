import { test, expect } from "@playwright/test";

/**
 * Solo lectura, a propósito — ver el comentario en playwright.config.ts:
 * no hay base de datos de pruebas separada, así que nada aquí inicia
 * sesión ni escribe datos. Lo que SÍ se puede probar sin tocar nada: que
 * las pantallas públicas se pintan, tienen lo que deben tener, y navegan
 * a donde toca.
 */

test("el login se pinta con sus campos y enlaces", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("#email")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Crea una" })).toHaveAttribute("href", "/registro");
});

test("del login se puede ir a registro y a olvidé mi contraseña", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Crea una" }).click();
  await expect(page).toHaveURL(/\/registro$/);

  await page.goto("/login");
  await page.getByRole("link", { name: "¿La olvidaste?" }).click();
  await expect(page).toHaveURL(/\/olvide-password$/);
});

test("términos y privacidad cargan sin sesión", async ({ page }) => {
  await page.goto("/terminos");
  await expect(page.getByRole("heading", { name: "Términos de uso" })).toBeVisible();

  await page.goto("/privacidad");
  await expect(page.locator("h1")).toBeVisible();
});

test("una URL vieja de /categorias redirige a /notas (aunque pida sesión primero)", async ({ page }) => {
  // La redirección de manifest.ts corre ANTES que el proxy — pero sin
  // sesión, /notas mismo rebota a /login. Lo que se comprueba aquí es que
  // /categorias no sea una ruta muerta en sí misma (404), no el destino
  // final tras el login.
  await page.goto("/categorias");
  await expect(page).not.toHaveURL(/\/categorias$/);
});

test("una nota compartida con un token que no existe da 404, no un error crudo", async ({ page }) => {
  const res = await page.goto("/compartido/este-token-no-existe-nunca-jamas");
  expect(res?.status()).toBe(404);
});

test("el manifiesto de la PWA incluye share_target (compartir desde otras apps)", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();
  expect(manifest.share_target?.action).toBe("/api/share-target");
});
