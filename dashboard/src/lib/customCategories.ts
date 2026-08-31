import "server-only";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "./prisma";

const MAX_CUSTOM_CATEGORY_NOMBRE = 30;

export interface CustomCategoryView {
  id: string;
  nombre: string;
  emoji: string | null;
}

/**
 * Categorías propias del usuario (Fase 3 del roadmap del bot: "categorías
 * configurables") — APARTE de las 6 fijas, nunca las sustituyen. Por
 * usuario, no por workspace: son tan tuyas como tus propias notas.
 */
export async function listCustomCategories(userId: string): Promise<CustomCategoryView[]> {
  return prisma.customCategory.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, nombre: true, emoji: true },
  });
}

/**
 * Una sola categoría propia, verificando que sea de ESTE usuario — una
 * clave foránea solo garantiza que la fila existe, no que sea tuya (mismo
 * chequeo que ya hace el bot antes de escribir `customCategoryId` en un
 * mensaje, ver `PrismaMessageRepository.setCustomCategory`).
 */
export async function findOwnCustomCategory(userId: string, id: string): Promise<CustomCategoryView | null> {
  return prisma.customCategory.findFirst({
    where: { id, userId },
    select: { id: true, nombre: true, emoji: true },
  });
}

export interface CreateCustomCategoryResult {
  error?: string;
  /** El registro recién creado, con su id REAL — el cliente lo usa para su reflejo optimista en vez de inventarse uno provisional que luego habría que reconciliar. */
  categoria?: CustomCategoryView;
}

export async function createCustomCategory(userId: string, nombre: string, emoji: string): Promise<CreateCustomCategoryResult> {
  const trimmed = nombre.trim();
  if (!trimmed) return { error: "Ponle un nombre a la categoría." };
  if (trimmed.length > MAX_CUSTOM_CATEGORY_NOMBRE) {
    return { error: `El nombre no puede tener más de ${MAX_CUSTOM_CATEGORY_NOMBRE} caracteres.` };
  }
  // Un emoji suelto no mide "un carácter" para JS (los emoji modernos son
  // varios code points, p. ej. 🍳 son dos) — se cuenta por code point con
  // el iterador de string, no con `.length`, o un emoji normal se
  // rechazaría como "demasiado largo".
  const emojiTrimmed = emoji.trim();
  if (emojiTrimmed && [...emojiTrimmed].length > 4) {
    return { error: "Eso no parece un solo emoji." };
  }

  try {
    const categoria = await prisma.customCategory.create({
      data: { userId, nombre: trimmed, emoji: emojiTrimmed || null },
      select: { id: true, nombre: true, emoji: true },
    });
    return { categoria };
  } catch (err) {
    // Restricción única (userId, nombre) — mensaje claro en vez del error
    // crudo de Postgres.
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { error: "Ya tienes una categoría con ese nombre." };
    }
    console.error("No se pudo crear la categoría:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido crear la categoría." };
  }
}

/**
 * Borra una categoría propia. Las notas que la llevaban NO se pierden ni
 * rompen nada: `customCategoryId` vuelve a null solo (ON DELETE SET NULL,
 * ver schema.prisma) — la nota se queda con su categoría FIJA de siempre,
 * simplemente sin la etiqueta.
 */
export async function deleteCustomCategory(userId: string, id: string): Promise<{ error?: string }> {
  try {
    const { count } = await prisma.customCategory.deleteMany({ where: { id, userId } });
    if (count === 0) return { error: "Esa categoría no existe." };
    return {};
  } catch (err) {
    console.error("No se pudo borrar la categoría:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido borrar la categoría." };
  }
}
