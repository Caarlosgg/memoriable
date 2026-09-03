import { env, hasDatabase } from '../config/env.js';

/**
 * Cliente de Prisma perezoso, igual criterio que prismaRepository.ts: sin
 * DATABASE_URL (o sin `prisma generate` corrido), el resto del sistema debe
 * poder importarse y ejecutarse sin fallar en carga.
 */
type UserClient = {
  user: {
    findUnique(args: unknown): Promise<{ id: string; linkCodeExpiresAt?: Date | null } | null>;
    findMany(args: unknown): Promise<{ id: string; telegramChatId: bigint | null }[]>;
    update(args: unknown): Promise<unknown>;
  };
};

let clientPromise: Promise<UserClient> | null = null;

async function getClient(): Promise<UserClient> {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL no está definida: no se puede resolver el usuario dueño del chat.');
  }
  if (!clientPromise) {
    clientPromise = import('@prisma/client').then(
      (mod) => new (mod as unknown as { PrismaClient: new () => never }).PrismaClient() as unknown as UserClient,
    );
  }
  return clientPromise;
}

/**
 * Usuario "implícito" para cuando no hay base de datos real (modo en
 * memoria: tests, `npm run simulate`, desarrollo local sin DATABASE_URL).
 * En ese modo no existen cuentas reales — todo mensaje se trata como de un
 * único usuario de desarrollo, igual que se comportaba el sistema antes de
 * la Fase 2 (multiusuario).
 */
export const LOCAL_DEV_USER_ID = 'local-dev';

/**
 * Resuelve qué cuenta del dashboard es dueña de un chat de Telegram.
 * - Sin DATABASE_URL: siempre `LOCAL_DEV_USER_ID` (modo en memoria/dev).
 * - Con DATABASE_URL: busca por `telegramChatId`; `null` si el chat no está
 *   vinculado a ninguna cuenta todavía.
 */
export async function resolveChatOwner(chatId: number): Promise<string | null> {
  if (!hasDatabase()) return LOCAL_DEV_USER_ID;

  const client = await getClient();
  const user = await client.user.findUnique({ where: { telegramChatId: BigInt(chatId) } });
  return user?.id ?? null;
}

export interface TelegramUser {
  userId: string;
  chatId: number;
}

/**
 * Todas las cuentas con un chat de Telegram vinculado — a quiénes hay que
 * mandarles el resumen diario.
 *
 * Antes el resumen iba a un `TELEGRAM_CHAT_ID` global: funcionaba para
 * exactamente una persona (el operador), y el resto de usuarios vinculados
 * no recibía nada nunca. Sin base de datos devuelve `[]`: el llamante decide
 * qué hacer (ver scheduler.ts, que en ese caso cae al chat de la variable de
 * entorno para no romper el desarrollo local).
 */
export async function listTelegramUsers(): Promise<TelegramUser[]> {
  if (!hasDatabase()) return [];

  const client = await getClient();
  const users = await client.user.findMany({
    where: { telegramChatId: { not: null } },
    select: { id: true, telegramChatId: true },
  });
  return users
    .filter((u): u is { id: string; telegramChatId: bigint } => u.telegramChatId !== null)
    .map((u) => ({ userId: u.id, chatId: Number(u.telegramChatId) }));
}

export type LinkTelegramChatResult = 'linked' | 'invalid_or_expired' | 'no_database';

/**
 * Vincula el chat de Telegram actual a la cuenta cuyo código de vínculo
 * vigente coincide (generado desde el dashboard, ver
 * dashboard/src/app/(dashboard)/cuenta/actions.ts). Consume el código: lo
 * limpia tras usarlo, de un solo uso.
 */
export async function linkTelegramChat(code: string, chatId: number): Promise<LinkTelegramChatResult> {
  if (!hasDatabase()) return 'no_database';

  const client = await getClient();
  const user = await client.user.findUnique({ where: { linkCode: code } });
  if (!user || !user.linkCodeExpiresAt || user.linkCodeExpiresAt.getTime() < Date.now()) {
    return 'invalid_or_expired';
  }

  await client.user.update({
    where: { id: user.id },
    data: { telegramChatId: BigInt(chatId), linkCode: null, linkCodeExpiresAt: null },
  });
  return 'linked';
}
