import "server-only";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export interface UploadImageResult {
  url?: string;
  error?: string;
}

/**
 * Validación + subida a Vercel Blob compartida entre `actions.ts` (imagen
 * de una nota) y `chat/actions.ts` (imagen de un mensaje) — mismos límites,
 * mismo proveedor, solo cambia el prefijo de la ruta para no mezclar unas
 * con otras en el bucket.
 */
export async function uploadImageToBlob(pathPrefix: string, file: File): Promise<UploadImageResult> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { error: "Solo se admiten imágenes (PNG, JPEG, WEBP o GIF)." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "La imagen pesa demasiado (máx. 8 MB)." };
  }
  try {
    const extension = file.type.split("/")[1];
    const blob = await put(`${pathPrefix}/${randomUUID()}.${extension}`, file, { access: "public" });
    return { url: blob.url };
  } catch (err) {
    console.error("Error al subir la imagen a Vercel Blob:", err);
    return { error: "No se ha podido subir la imagen. Inténtalo de nuevo en un momento." };
  }
}
