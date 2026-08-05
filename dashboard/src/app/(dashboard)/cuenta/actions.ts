"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { verifySession } from "@/lib/dal";
import { generateLinkCode } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildExportData, toExportJson, toExportMarkdown, isExportScope, type ExportScope } from "@/lib/exportData";

export interface GenerateLinkCodeState {
  code?: string;
  expiresAt?: string;
  error?: string;
}

/**
 * Genera un código corto de un solo uso para vincular el chat de Telegram a
 * la cuenta actual. El propio bot lo consume con /vincular <código> (ver
 * src/telegram/bot.ts) y fija `telegramChatId` en esta misma fila.
 */
export async function generateTelegramLinkCode(): Promise<GenerateLinkCodeState> {
  const userId = await verifySession();

  const { code, expiresAt } = generateLinkCode();
  try {
    await prisma.user.update({ where: { id: userId }, data: { linkCode: code, linkCodeExpiresAt: expiresAt } });
  } catch (err) {
    console.error("No se pudo generar el código de vínculo:", err);
    return { error: "No se ha podido generar el código. Inténtalo de nuevo." };
  }

  revalidatePath("/cuenta");
  return { code, expiresAt: expiresAt.toISOString() };
}

export interface ExportResult {
  content?: string;
  filename?: string;
  error?: string;
}

/**
 * Exportación completa de datos del usuario (casi obligatoria de cara a
 * RGPD): todo / solo notas / una categoría, en Markdown o JSON. Devuelve
 * el contenido como texto — el cliente lo convierte en descarga con un
 * Blob, no hay ningún fichero temporal en el servidor.
 */
export async function exportData(scope: ExportScope, format: "markdown" | "json"): Promise<ExportResult> {
  const userId = await verifySession();
  if (!isExportScope(scope)) return { error: "Alcance de exportación no válido." };

  try {
    const payload = await buildExportData(userId, scope);
    const content = format === "json" ? toExportJson(payload) : toExportMarkdown(payload);
    const scopeSlug = scope.type === "categoria" ? scope.categoria : scope.type;
    const dateSlug = payload.generatedAt.slice(0, 10);
    const extension = format === "json" ? "json" : "md";
    return { content, filename: `memoriable-${scopeSlug}-${dateSlug}.${extension}` };
  } catch (err) {
    console.error("Error al exportar los datos:", err);
    Sentry.captureException(err);
    return { error: "No se ha podido generar la exportación. Inténtalo de nuevo." };
  }
}
