import { env, hasDatabase } from '../config/env.js';

/**
 * Cliente de Prisma perezoso, igual criterio que prismaRepository.ts: sin
 * DATABASE_URL (o sin `prisma generate` corrido), el resto del sistema debe
 * poder importarse y ejecutarse sin fallar en carga.
 */
type TxClient = {
  user: {
    create(args: unknown): Promise<{ id: string }>;
    update(args: unknown): Promise<unknown>;
  };
  workspace: {
    create(args: unknown): Promise<{ id: string }>;
  };
  membership: {
    create(args: unknown): Promise<unknown>;
  };
};

type UserClient = {
  user: {
    findUnique(args: unknown): Promise<{ id: string; linkCodeExpiresAt?: Date | null } | null>;
    findMany(args: unknown): Promise<{ id: string; telegramChatId: bigint | null }[]>;
    update(args: unknown): Promise<unknown>;
  };
  message: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
  };
  $transaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T>;
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

/** Prefijo del email sintético de una cuenta auto-provisionada — ver `resolveOrCreateChatOwner`. */
const TELEGRAM_EMAIL_DOMAIN = 'telegram.memoriable.local';

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

export interface ChatOwnerResolution {
  userId: string;
  /** `true` solo en la respuesta que acaba de crear la cuenta — para poder avisar una vez, no en cada mensaje. */
  recienCreado: boolean;
}

/**
 * Igual que `resolveChatOwner`, pero para una interacción REAL de una
 * persona con el bot (nunca para un job de fondo como el resumen diario:
 * ver scheduler.ts, que sigue usando `resolveChatOwner` a propósito — un
 * cron no debe poder crear cuentas por su cuenta).
 *
 * Antes, un chat sin vincular recibía "vincula tu cuenta desde el
 * dashboard con un código" — un paso previo obligatorio antes de poder
 * usar el bot para nada. Ahora, el primer mensaje de un chat nuevo crea
 * su cuenta y su espacio personal AL VUELO, aislados y solo suyos, sin
 * ningún paso intermedio: "vive solo, funciona sin problemas".
 *
 * El email es sintético (`tg-<chatId>@telegram.memoriable.local`) —
 * nunca se usa para entrar por email/contraseña, solo satisface el
 * `@unique` de `User.email`. `accountPending: true` dice lo mismo que ya
 * dice para una cuenta corporativa creada por un compañero de equipo
 * (ver `addMemberByEmail` en el dashboard): existe, pero todavía no tiene
 * con qué entrar por la web. El comando `/email` (ver bot.ts) es el
 * camino para añadir un correo real más tarde, sin perder nada de lo ya
 * guardado — la cuenta es la misma, solo gana una puerta de entrada más.
 *
 * `linkTelegramChat` (con `/vincular <código>`) sigue disponible aparte,
 * para quien YA tenía una cuenta en la web (con su propio historial) y
 * quiere que el bot escriba ahí en vez de en una cuenta nueva.
 *
 * Condición de carrera: si dos mensajes del mismo chat nuevo llegan casi
 * a la vez, la segunda `create` puede chocar con el `@unique` de
 * `telegramChatId` que la primera ya puso. Se relee en ese caso en vez de
 * propagar el error — el resultado correcto (la cuenta que ganó la
 * carrera) es el mismo para las dos.
 */
export async function resolveOrCreateChatOwner(chatId: number): Promise<ChatOwnerResolution> {
  if (!hasDatabase()) return { userId: LOCAL_DEV_USER_ID, recienCreado: false };

  const client = await getClient();
  const existing = await client.user.findUnique({ where: { telegramChatId: BigInt(chatId) } });
  if (existing) return { userId: existing.id, recienCreado: false };

  try {
    const userId = await client.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: `tg-${chatId}@${TELEGRAM_EMAIL_DOMAIN}`,
          telegramChatId: BigInt(chatId),
          accountPending: true,
        },
      });
      const workspace = await tx.workspace.create({ data: { nombre: 'Personal', personal: true } });
      await tx.membership.create({
        data: { userId: user.id, workspaceId: workspace.id, role: 'OWNER', status: 'ACTIVE' },
      });
      await tx.user.update({ where: { id: user.id }, data: { personalWorkspaceId: workspace.id } });
      return user.id;
    });
    return { userId, recienCreado: true };
  } catch {
    const ganador = await client.user.findUnique({ where: { telegramChatId: BigInt(chatId) } });
    if (!ganador) throw new Error(`No se pudo crear ni encontrar la cuenta del chat ${chatId}.`);
    return { userId: ganador.id, recienCreado: false };
  }
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

export type LinkTelegramChatResult =
  | 'linked'
  | 'invalid_or_expired'
  | 'no_database'
  /** Ver el comentario de más abajo: este chat ya tiene notas propias y no se pisan en silencio. */
  | 'chat_con_datos_propios';

/**
 * Vincula el chat de Telegram actual a la cuenta cuyo código de vínculo
 * vigente coincide (generado desde el dashboard, ver
 * dashboard/src/app/(dashboard)/cuenta/actions.ts). Consume el código: lo
 * limpia tras usarlo, de un solo uso.
 *
 * Desde que existe `resolveOrCreateChatOwner`, este chat casi seguro YA
 * tiene una cuenta propia auto-provisionada antes de que a nadie se le
 * ocurra vincularlo a otra (basta con haber escrito una vez). Si esa
 * cuenta tiene notas guardadas, vincular este chat a otra cuenta las
 * dejaría fuera de alcance para siempre —el bot ya no volvería a
 * enseñarlas—, así que se para en vez de perderlas en silencio (mismo
 * criterio que el resto del proyecto: nunca sobrescribir datos guardados
 * de forma irreversible sin decirlo). Sin notas propias (cuenta recién
 * creada, vacía) no hay nada que perder: se libera y se vincula sin más.
 */
export async function linkTelegramChat(code: string, chatId: number): Promise<LinkTelegramChatResult> {
  if (!hasDatabase()) return 'no_database';

  const client = await getClient();
  const user = await client.user.findUnique({ where: { linkCode: code } });
  if (!user || !user.linkCodeExpiresAt || user.linkCodeExpiresAt.getTime() < Date.now()) {
    return 'invalid_or_expired';
  }

  const dueñoActual = await client.user.findUnique({ where: { telegramChatId: BigInt(chatId) } });
  const cambiaDeCuenta = dueñoActual && dueñoActual.id !== user.id;
  if (cambiaDeCuenta) {
    const tieneNotas = await client.message.findFirst({ where: { userId: dueñoActual.id } });
    if (tieneNotas) return 'chat_con_datos_propios';
  }

  await client.$transaction(async (tx) => {
    if (cambiaDeCuenta) {
      await tx.user.update({ where: { id: dueñoActual.id }, data: { telegramChatId: null } });
    }
    await tx.user.update({
      where: { id: user.id },
      data: { telegramChatId: BigInt(chatId), linkCode: null, linkCodeExpiresAt: null },
    });
  });
  return 'linked';
}
