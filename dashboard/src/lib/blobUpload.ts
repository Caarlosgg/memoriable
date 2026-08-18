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
 * Vercel Blob necesita `BLOB_READ_WRITE_TOKEN`. Sin ella `put()` falla
 * SIEMPRE — no es un fallo pasajero, así que ni se intenta ni se responde
 * "inténtalo de nuevo en un momento" (que era justo lo que hacía antes:
 * adjuntar una imagen fallaba una y otra vez sin decir por qué).
 *
 * Mismo criterio perezoso que el resto de integraciones externas del
 * proyecto (Groq, Realtime, push): sin la variable, esta función concreta
 * no está disponible y la interfaz ni la ofrece, pero el resto sigue
 * funcionando igual — se escriben mensajes y notas, solo que sin adjuntar.
 */
export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Validación + subida a Vercel Blob compartida entre `actions.ts` (imagen
 * de una nota) y `chat/actions.ts` (imagen de un mensaje) — mismos límites,
 * mismo proveedor, solo cambia el prefijo de la ruta para no mezclar unas
 * con otras en el bucket.
 */
export async function uploadImageToBlob(pathPrefix: string, file: File): Promise<UploadImageResult> {
  if (!isBlobConfigured()) {
    return { error: "Adjuntar imágenes no está configurado en este servidor (falta BLOB_READ_WRITE_TOKEN)." };
  }
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
