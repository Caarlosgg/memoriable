import { env, hasDatabase } from '../config/env.js';

/**
 * Dónde escribe el bot.
 *
 * Hasta la Fase 4 el bot no tenía concepto de equipo: guardaba SIEMPRE en el
 * workspace personal del dueño del chat. Si trabajabas en equipo, todo lo
 * que dictabas caía en tu espacio privado y el equipo no lo veía nunca — el
 * producto se vende como "escribes al bot" y el bot no sabía dónde trabajas.
 *
 * La elección vive en `User.botWorkspaceId` y no en la cookie de workspace
 * activo del dashboard por dos razones: el bot no tiene acceso a esa cookie,
 * y son elecciones legítimamente distintas (puedes estar mirando el tablero
 * del equipo mientras dictas notas a tu espacio personal).
 *
 * Cliente de Prisma perezoso, mismo criterio que users.ts y
 * prismaRepository.ts: sin DATABASE_URL el resto del sistema debe poder
 * importarse y ejecutarse igual.
 */
type WorkspaceClient = {
  user: {
    findUnique(args: unknown): Promise<{
      personalWorkspaceId: string | null;
      botWorkspaceId: string | null;
    } | null>;
    update(args: unknown): Promise<unknown>;
  };
  membership: {
    findMany(args: unknown): Promise<
      { workspaceId: string; role: string; workspace: { id: string; nombre: string; personal: boolean } }[]
    >;
    findUnique(args: unknown): Promise<{ status: string; role: string } | null>;
  };
  workspace: {
    findUnique(args: unknown): Promise<{ id: string; nombre: string } | null>;
  };
};

let clientPromise: Promise<WorkspaceClient> | null = null;

async function getClient(): Promise<WorkspaceClient> {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL no está definida: no se puede resolver el espacio de trabajo.');
  }
  if (!clientPromise) {
    clientPromise = import('@prisma/client').then(
      (mod) =>
        new (mod as unknown as { PrismaClient: new () => never })
          .PrismaClient() as unknown as WorkspaceClient,
    );
  }
  return clientPromise;
}

export interface BotWorkspace {
  id: string;
  nombre: string;
  personal: boolean;
  /**
   * Rol del usuario en ese espacio. Lo necesita el Asistente para saber qué
   * puede hacer (un VIEWER no crea ni asigna nada) — ver `/pregunta`. En el
   * espacio personal siempre eres OWNER.
   */
  role: string;
}

/**
 * Espacios entre los que el usuario puede elegir desde `/espacio`: su
 * personal más los equipos donde su membresía sigue ACTIVA (una invitación
 * sin aceptar no es un sitio donde se pueda escribir todavía).
 *
 * El personal va primero siempre: es el destino por defecto y el que más se
 * usa, así que debe ser el primer botón, no uno perdido en la lista.
 */
export async function listBotWorkspaces(userId: string): Promise<BotWorkspace[]> {
  if (!hasDatabase()) return [];
  const client = await getClient();
  const memberships = await client.membership.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { workspace: { select: { id: true, nombre: true, personal: true } } },
    orderBy: { joinedAt: 'asc' },
  });
  const espacios = memberships.map((m) => ({ ...m.workspace, role: m.role }));
  return [...espacios.filter((w) => w.personal), ...espacios.filter((w) => !w.personal)];
}

/**
 * Dónde debe guardar el bot AHORA MISMO para este usuario.
 *
 * Comprueba en cada llamada que la membresía siga ACTIVA en vez de fiarse de
 * lo guardado: te pueden haber sacado del equipo (o degradado la membresía)
 * después de elegirlo, y seguir escribiendo ahí sería guardar en un sitio
 * que ya no es tuyo. En ese caso vuelve al personal en silencio y lo deja
 * anotado en la propia fila, para no repetir la comprobación fallida en cada
 * mensaje.
 *
 * Lanza si el usuario no tiene workspace personal: eso es un estado
 * inconsistente real (toda cuenta lo tiene desde el alta), no algo que deba
 * silenciarse guardando con workspaceId nulo.
 */
export async function resolveBotWorkspace(userId: string): Promise<BotWorkspace> {
  const client = await getClient();
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { personalWorkspaceId: true, botWorkspaceId: true },
  });
  if (!user?.personalWorkspaceId) {
    throw new Error(`El usuario ${userId} no tiene workspace personal.`);
  }

  const caerAlPersonal = async (limpiar: boolean): Promise<BotWorkspace> => {
    if (limpiar) {
      await client.user
        .update({ where: { id: userId }, data: { botWorkspaceId: null } })
        .catch(() => {});
    }
    const personal = await client.workspace.findUnique({
      where: { id: user.personalWorkspaceId! },
      select: { id: true, nombre: true },
    });
    // OWNER siempre en el personal: es tuyo y solo tuyo.
    return { id: user.personalWorkspaceId!, nombre: personal?.nombre ?? 'Mi espacio', personal: true, role: 'OWNER' };
  };

  if (!user.botWorkspaceId || user.botWorkspaceId === user.personalWorkspaceId) {
    return caerAlPersonal(false);
  }

  const membership = await client.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: user.botWorkspaceId } },
    select: { status: true, role: true },
  });
  if (membership?.status !== 'ACTIVE') return caerAlPersonal(true);

  const workspace = await client.workspace.findUnique({
    where: { id: user.botWorkspaceId },
    select: { id: true, nombre: true },
  });
  if (!workspace) return caerAlPersonal(true);

  return { id: workspace.id, nombre: workspace.nombre, personal: false, role: membership.role };
}

export type SetBotWorkspaceResult = 'ok' | 'no_member' | 'no_database';

/**
 * Fija dónde escribe el bot. Verifica la membresía ACTIVA en el `where` de
 * la lectura previa —no con un `if` después— por el mismo motivo que el
 * resto de escrituras del proyecto: un id que llega por `callback_data` de
 * Telegram es entrada de usuario, y nadie debe poder apuntar su bot a un
 * equipo del que no forma parte escribiendo el id a mano.
 */
export async function setBotWorkspace(
  userId: string,
  workspaceId: string,
): Promise<SetBotWorkspaceResult> {
  if (!hasDatabase()) return 'no_database';
  const client = await getClient();

  const membership = await client.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { status: true },
  });
  if (membership?.status !== 'ACTIVE') return 'no_member';

  await client.user.update({ where: { id: userId }, data: { botWorkspaceId: workspaceId } });
  return 'ok';
}
