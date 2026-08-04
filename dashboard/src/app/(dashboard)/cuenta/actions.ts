"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/dal";
import { generateLinkCode } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
