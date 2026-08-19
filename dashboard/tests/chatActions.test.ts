import { describe, expect, it, vi, beforeEach, beforeAll } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));
vi.mock("@/lib/blobUpload", () => ({ uploadImageToBlob: vi.fn() }));

const createNotification = vi.fn();
vi.mock("@/lib/notifications", () => ({
  createNotification: (...args: unknown[]) => createNotification(...args),
}));

const notifyChatParticipants = vi.fn<
  (
    conversationId: string,
    senderUserId: string,
    texto: string,
    tieneImagen: boolean,
  ) => Promise<void>
>(async () => {});
vi.mock("@/lib/chatNotifications", () => ({
  notifyChatParticipants: (
    conversationId: string,
    senderUserId: string,
    texto: string,
    tieneImagen: boolean,
  ) => notifyChatParticipants(conversationId, senderUserId, texto, tieneImagen),
}));

// Sin configurar Realtime, `broadcastNewChatMessage` no hace nada — así los
// tests no dependen de red ni de Supabase (regla 3 de CLAUDE.md).
vi.mock("@/lib/chatRealtime", () => ({
  chatChannelTopic: (id: string) => `chat-${id}`,
  CHAT_NEW_MESSAGE_EVENT: "new-message",
  supabaseRealtimeUrl: () => undefined,
  supabaseRealtimeAnonKey: () => undefined,
  isSupabaseRealtimeConfigured: () => false,
}));

const participantFindUnique = vi.fn();
const participantUpsert = vi.fn();
const participantFindMany = vi.fn();
const participantCreateMany = vi.fn();
const participantUpdateMany = vi.fn();
const participantDeleteMany = vi.fn();
const participantCount = vi.fn();
const chatMessageDeleteMany = vi.fn();
const chatMessageCreate = vi.fn();
const chatMessageFindMany = vi.fn();
const chatMessageFindUnique = vi.fn();
const conversationFindFirst = vi.fn();
const conversationUpsert = vi.fn();
const conversationCreate = vi.fn();
const conversationFindUnique = vi.fn();
const userFindUnique = vi.fn();
const userCount = vi.fn();
const membershipFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    chatConversationParticipant: {
      findUnique: (...args: unknown[]) => participantFindUnique(...args),
      upsert: (...args: unknown[]) => participantUpsert(...args),
      findMany: (...args: unknown[]) => participantFindMany(...args),
      createMany: (...args: unknown[]) => participantCreateMany(...args),
      updateMany: (...args: unknown[]) => participantUpdateMany(...args),
      deleteMany: (...args: unknown[]) => participantDeleteMany(...args),
      count: (...args: unknown[]) => participantCount(...args),
      delete: vi.fn(),
      update: vi.fn(),
    },
    chatMessage: {
      deleteMany: (...args: unknown[]) => chatMessageDeleteMany(...args),
      create: (...args: unknown[]) => chatMessageCreate(...args),
      findMany: (...args: unknown[]) => chatMessageFindMany(...args),
      findUnique: (...args: unknown[]) => chatMessageFindUnique(...args),
    },
    chatConversation: {
      findFirst: (...args: unknown[]) => conversationFindFirst(...args),
      upsert: (...args: unknown[]) => conversationUpsert(...args),
      create: (...args: unknown[]) => conversationCreate(...args),
      findUnique: (...args: unknown[]) => conversationFindUnique(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      count: (...args: unknown[]) => userCount(...args),
    },
    membership: {
      findMany: (...args: unknown[]) => membershipFindMany(...args),
      count: vi.fn(),
    },
  },
}));

const CONVERSACION_PROPIA = {
  conversation: { id: "c1", workspaceId: "w1", type: "GROUP" },
};

beforeEach(() => {
  participantFindUnique.mockReset();
  participantFindUnique.mockResolvedValue(CONVERSACION_PROPIA);
  participantUpsert.mockReset();
  participantFindMany.mockReset();
  participantFindMany.mockResolvedValue([]);
  participantCreateMany.mockReset();
  participantUpdateMany.mockReset();
  participantDeleteMany.mockReset();
  participantCount.mockReset();
  chatMessageDeleteMany.mockReset();
  chatMessageCreate.mockReset();
  chatMessageFindMany.mockReset();
  chatMessageFindMany.mockResolvedValue([]);
  chatMessageFindUnique.mockReset();
  conversationFindFirst.mockReset();
  conversationUpsert.mockReset();
  conversationCreate.mockReset();
  conversationFindUnique.mockReset();
  userFindUnique.mockReset();
  userFindUnique.mockResolvedValue({ id: "u2" });
  userCount.mockReset();
  userCount.mockResolvedValue(1);
  membershipFindMany.mockReset();
  membershipFindMany.mockResolvedValue([]);
  createNotification.mockReset();
  createNotification.mockResolvedValue(undefined);
});

describe("deleteChatMessage", () => {
  it("borra filtrando también por autor, para no poder tocar el mensaje de otro", async () => {
    chatMessageDeleteMany.mockResolvedValue({ count: 1 });
    const { deleteChatMessage } =
      await import("../src/app/(dashboard)/chat/actions");
    const result = await deleteChatMessage("m1");

    expect(result.error).toBeUndefined();
    // La comprobación de autoría va DENTRO de la consulta: sin `userId` en
    // el where, un id ajeno bastaría para borrar el mensaje de otro.
    expect(chatMessageDeleteMany).toHaveBeenCalledWith({
      where: { id: "m1", userId: "u1" },
    });
  });

  it("si el mensaje no es suyo no borra nada y lo dice, sin filtrar de quién era", async () => {
    chatMessageDeleteMany.mockResolvedValue({ count: 0 });
    const { deleteChatMessage } =
      await import("../src/app/(dashboard)/chat/actions");
    const result = await deleteChatMessage("m-ajeno");

    expect(result.error).toMatch(/solo puedes borrar tus propios mensajes/i);
  });

  it("ante un fallo de BD devuelve un mensaje en español, sin detalles internos", async () => {
    chatMessageDeleteMany.mockRejectedValue(
      new Error("ECONNREFUSED 10.0.0.1:5432"),
    );
    const { deleteChatMessage } =
      await import("../src/app/(dashboard)/chat/actions");
    const result = await deleteChatMessage("m1");

    expect(result.error).toMatch(/No se ha podido borrar/);
    expect(result.error).not.toMatch(/ECONNREFUSED/);
  });
});

describe("sendChatMessage", () => {
  it("rechaza escribir en una conversación de la que no se es participante", async () => {
    participantFindUnique.mockResolvedValue(null);
    const { sendChatMessage } =
      await import("../src/app/(dashboard)/chat/actions");
    const result = await sendChatMessage("c-ajena", "hola");

    expect(result.error).toMatch(/No perteneces a esta conversación/);
    expect(chatMessageCreate).not.toHaveBeenCalled();
  });

  it("guarda el mensaje en la conversación y el workspace resueltos en el servidor, no en los que mande el cliente", async () => {
    chatMessageCreate.mockResolvedValue({
      id: "m1",
      texto: "hola",
      imagenUrl: null,
      createdAt: new Date("2026-08-17T10:00:00.000Z"),
      userId: "u1",
      user: { email: "ana@example.com" },
    });
    const { sendChatMessage } =
      await import("../src/app/(dashboard)/chat/actions");
    const result = await sendChatMessage("c1", "  hola  ");

    expect(result.message?.texto).toBe("hola");
    expect(chatMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          texto: "hola",
          imagenUrl: null,
          userId: "u1",
          workspaceId: "w1",
          conversationId: "c1",
        },
      }),
    );
  });

  it("avisa por push a los demás participantes, con el texto ya recortado", async () => {
    chatMessageCreate.mockResolvedValue({
      id: "m1",
      texto: "hola",
      imagenUrl: null,
      createdAt: new Date(),
      userId: "u1",
      user: { email: "ana@example.com" },
    });
    const { sendChatMessage } =
      await import("../src/app/(dashboard)/chat/actions");
    await sendChatMessage("c1", "  hola  ");

    expect(notifyChatParticipants).toHaveBeenCalledWith(
      "c1",
      "u1",
      "hola",
      false,
    );
  });

  it("rechaza un mensaje vacío sin imagen", async () => {
    const { sendChatMessage } =
      await import("../src/app/(dashboard)/chat/actions");
    const result = await sendChatMessage("c1", "   ");

    expect(result.error).toMatch(/Escribe algo o adjunta una imagen/);
    expect(chatMessageCreate).not.toHaveBeenCalled();
  });

  it("rechaza un mensaje que pasa del límite de longitud", async () => {
    const { sendChatMessage } =
      await import("../src/app/(dashboard)/chat/actions");
    const result = await sendChatMessage("c1", "a".repeat(2001));

    expect(result.error).toMatch(/no puede tener más de 2000/);
    expect(chatMessageCreate).not.toHaveBeenCalled();
  });
});

describe("searchChatMessages", () => {
  it("devuelve vacío (sin lanzar) si no se es participante, sin llegar a consultar", async () => {
    participantFindUnique.mockResolvedValue(null);
    const { searchChatMessages } =
      await import("../src/app/(dashboard)/chat/actions");

    await expect(searchChatMessages("c-ajena", "hola")).resolves.toEqual([]);
    expect(chatMessageFindMany).not.toHaveBeenCalled();
  });

  it("con menos de dos letras no busca: evita traerse media conversación por una tecla", async () => {
    const { searchChatMessages } =
      await import("../src/app/(dashboard)/chat/actions");

    await expect(searchChatMessages("c1", "a")).resolves.toEqual([]);
    expect(chatMessageFindMany).not.toHaveBeenCalled();
  });

  it("busca en TODA la conversación, no solo en lo cargado, y de la más reciente hacia atrás", async () => {
    chatMessageFindMany.mockResolvedValue([
      {
        id: "m9",
        texto: "hola qué tal",
        imagenUrl: null,
        createdAt: new Date("2026-08-19T10:00:00.000Z"),
        userId: "u2",
        user: { email: "ana@example.com" },
      },
    ]);
    const { searchChatMessages } =
      await import("../src/app/(dashboard)/chat/actions");

    const result = await searchChatMessages("c1", "  hola  ");

    expect(result).toHaveLength(1);
    expect(chatMessageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          conversationId: "c1",
          texto: { contains: "hola", mode: "insensitive" },
        },
        orderBy: { createdAt: "desc" },
      }),
    );
  });
});

describe("listChatMessages", () => {
  it("devuelve vacío (sin lanzar) si no se es participante — nunca filtra mensajes ajenos", async () => {
    participantFindUnique.mockResolvedValue(null);
    const { listChatMessages } =
      await import("../src/app/(dashboard)/chat/actions");

    await expect(listChatMessages("c-ajena")).resolves.toEqual([]);
    expect(chatMessageFindMany).not.toHaveBeenCalled();
  });
});

describe("createDirectConversation", () => {
  it("no deja abrir una conversación con uno mismo", async () => {
    const { createDirectConversation } =
      await import("../src/app/(dashboard)/chat/actions");
    const result = await createDirectConversation("u1");

    expect(result.error).toMatch(/contigo mismo/);
    expect(conversationUpsert).not.toHaveBeenCalled();
  });

  it("rechaza a alguien sin cuenta en la app", async () => {
    userFindUnique.mockResolvedValue(null);
    const { createDirectConversation } =
      await import("../src/app/(dashboard)/chat/actions");
    const result = await createDirectConversation("u-inexistente");

    expect(result.error).toMatch(/no tiene cuenta en MemorIAble/);
    expect(conversationUpsert).not.toHaveBeenCalled();
  });

  it("no depende de ningún workspace: crea el hilo sin comprobar equipo ni espacio activo", async () => {
    conversationUpsert.mockResolvedValue({ id: "c-directa" });
    const { createDirectConversation } =
      await import("../src/app/(dashboard)/chat/actions");
    const result = await createDirectConversation("u2");

    expect(result.conversationId).toBe("c-directa");
    expect(
      conversationUpsert.mock.calls[0]![0].create.workspaceId,
    ).toBeUndefined();
  });

  // ÚLTIMO test de este describe a propósito: `vi.doMock` + `vi.resetModules`
  // cambia qué usuario devuelve `verifySession` para el resto del archivo, y
  // un test posterior que asumiera seguir siendo "u1" fallaría por eso, no
  // por su propia lógica.
  it("usa una clave estable entre los dos participantes, para no duplicar el hilo según quién lo abra", async () => {
    conversationUpsert.mockResolvedValue({ id: "c-directa" });
    const { createDirectConversation } =
      await import("../src/app/(dashboard)/chat/actions");

    await createDirectConversation("u2");
    const primeraClave = conversationUpsert.mock.calls[0]![0].where.directKey;

    conversationUpsert.mockClear();
    // El mismo par, pero mirado desde el otro lado: la clave debe coincidir
    // (van ordenados), o cada uno abriría su propio hilo con el otro.
    vi.doMock("@/lib/dal", () => ({ verifySession: async () => "u2" }));
    vi.resetModules();
    const { createDirectConversation: crearDesdeU2 } =
      await import("../src/app/(dashboard)/chat/actions");
    await crearDesdeU2("u1");
    const segundaClave = conversationUpsert.mock.calls[0]![0].where.directKey;

    expect(primeraClave).toBe(segundaClave);
  });
});

describe("ensureDefaultGroupConversation", () => {
  it("reutiliza el grupo «Equipo» existente y afilia a quien todavía no estaba dentro", async () => {
    // Alguien añadido al equipo DESPUÉS de crearse el grupo debe entrar solo,
    // sin tener que unirse a mano.
    conversationFindFirst.mockResolvedValue({ id: "c-equipo" });
    participantUpsert.mockResolvedValue({});
    const { ensureDefaultGroupConversation } =
      await import("../src/app/(dashboard)/chat/actions");

    await expect(ensureDefaultGroupConversation("w1", "u-nuevo")).resolves.toBe(
      "c-equipo",
    );
    expect(participantUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          conversationId_userId: {
            conversationId: "c-equipo",
            userId: "u-nuevo",
          },
        },
      }),
    );
  });
});

// El último test de "createDirectConversation" deja `verifySession` fijado a
// "u2" para el resto del archivo (ver su comentario). Un `vi.doMock` a nivel
// de módulo se aplicaría en la fase de COLECCIÓN (antes de que ese test
// llegue a ejecutarse) y se perdería, así que el reset va en un `beforeAll`
// — un hook, que sí corre en fase de EJECUCIÓN, en su sitio real — para
// volver a "u1" aquí, una sola vez, antes de las invitaciones de chat.
describe("Invitaciones de chat (Fase 6)", () => {
  beforeAll(() => {
    vi.doMock("@/lib/dal", () => ({ verifySession: async () => "u1" }));
    vi.resetModules();
  });

  describe("createGroupConversation — invitaciones", () => {
    it("crea al autor ACTIVO y al resto PENDIENTE, y les notifica la invitación", async () => {
      userCount.mockResolvedValue(2);
      conversationCreate.mockResolvedValue({ id: "c-grupo" });
      const { createGroupConversation } =
        await import("../src/app/(dashboard)/chat/actions");

      const result = await createGroupConversation("Trabajo", ["u2", "u3"]);

      expect(result.conversationId).toBe("c-grupo");
      expect(conversationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            participants: {
              create: [
                { userId: "u1", status: "ACTIVE" },
                { userId: "u2", status: "PENDING" },
                { userId: "u3", status: "PENDING" },
              ],
            },
          }),
        }),
      );
      // `notifyChatInvites` es "fire-and-forget" (no se espera dentro de la
      // acción), así que hay que esperar a que el mock reciba la llamada.
      await vi.waitFor(() =>
        expect(createNotification).toHaveBeenCalledTimes(2),
      );
      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "u2",
          type: "CHAT_INVITE",
          link: "/chat?invite=c-grupo",
        }),
      );
      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "u3",
          type: "CHAT_INVITE",
          link: "/chat?invite=c-grupo",
        }),
      );
    });
  });

  describe("addParticipants — invitaciones", () => {
    it("solo notifica a quien de verdad es nuevo, no a quien ya estaba dentro o ya invitado", async () => {
      // `createMany` con `skipDuplicates` solo dice CUÁNTOS entraron, no
      // CUÁLES — por eso `yaDentro` se calcula ANTES con un findMany. Si esto
      // se rompe, alguien que ya estaba en el grupo recibiría un aviso de
      // invitación como si acabara de pasar algo que no ha pasado.
      userCount.mockResolvedValue(2);
      participantFindMany.mockResolvedValue([{ userId: "u2" }]);
      conversationFindUnique.mockResolvedValue({ nombre: "Trabajo" });
      const { addParticipants } =
        await import("../src/app/(dashboard)/chat/actions");

      const result = await addParticipants("c1", ["u2", "u3"]);

      expect(result.error).toBeUndefined();
      expect(participantCreateMany).toHaveBeenCalledWith({
        data: [{ conversationId: "c1", userId: "u3", status: "PENDING" }],
        skipDuplicates: true,
      });
      await vi.waitFor(() =>
        expect(createNotification).toHaveBeenCalledTimes(1),
      );
      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "u3",
          type: "CHAT_INVITE",
          link: "/chat?invite=c1",
        }),
      );
    });

    it("si nadie es nuevo, no inserta ni notifica", async () => {
      userCount.mockResolvedValue(1);
      participantFindMany.mockResolvedValue([{ userId: "u2" }]);
      const { addParticipants } =
        await import("../src/app/(dashboard)/chat/actions");

      await addParticipants("c1", ["u2"]);

      expect(participantCreateMany).toHaveBeenCalledWith({
        data: [],
        skipDuplicates: true,
      });
      expect(createNotification).not.toHaveBeenCalled();
    });
  });

  describe("acceptChatInvite / declineChatInvite", () => {
    it("acepta: pasa de PENDING a ACTIVE filtrando por autor y estado", async () => {
      participantUpdateMany.mockResolvedValue({ count: 1 });
      const { acceptChatInvite } =
        await import("../src/app/(dashboard)/chat/actions");

      const result = await acceptChatInvite("c1");

      expect(result.error).toBeUndefined();
      expect(participantUpdateMany).toHaveBeenCalledWith({
        where: { conversationId: "c1", userId: "u1", status: "PENDING" },
        data: { status: "ACTIVE" },
      });
    });

    it("acepta: sin invitación pendiente que coincida, no toca nada y avisa", async () => {
      participantUpdateMany.mockResolvedValue({ count: 0 });
      const { acceptChatInvite } =
        await import("../src/app/(dashboard)/chat/actions");

      const result = await acceptChatInvite("c-ajena");

      expect(result.error).toMatch(/No se ha encontrado esa invitación/);
    });

    it("rechaza: borra la fila PENDING filtrando por autor y estado", async () => {
      participantDeleteMany.mockResolvedValue({ count: 1 });
      const { declineChatInvite } =
        await import("../src/app/(dashboard)/chat/actions");

      const result = await declineChatInvite("c1");

      expect(result.error).toBeUndefined();
      expect(participantDeleteMany).toHaveBeenCalledWith({
        where: { conversationId: "c1", userId: "u1", status: "PENDING" },
      });
    });
  });

  describe("hasUnreadChat", () => {
    it('cuenta como "sin leer" tener una invitación pendiente, aunque no haya mensajes nuevos', async () => {
      participantFindMany.mockResolvedValue([]);
      participantCount.mockResolvedValue(1);
      const { hasUnreadChat } =
        await import("../src/app/(dashboard)/chat/actions");

      await expect(hasUnreadChat()).resolves.toBe(true);
    });
  });

  describe("listPendingChatInvites", () => {
    it("solo trae las invitaciones PENDIENTES del usuario, con el tamaño actual del grupo", async () => {
      participantFindMany.mockResolvedValue([
        {
          conversation: {
            id: "c-grupo",
            nombre: "Trabajo",
            _count: { participants: 3 },
          },
        },
      ]);
      const { listPendingChatInvites } =
        await import("../src/app/(dashboard)/chat/actions");

      const result = await listPendingChatInvites();

      expect(participantFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "u1", status: "PENDING" } }),
      );
      expect(result).toEqual([
        { conversationId: "c-grupo", nombre: "Trabajo", participantes: 3 },
      ]);
    });
  });

  describe("listKnownPeople", () => {
    it("junta compañeros y contactos de chat, sin repetir a quien es las dos cosas", async () => {
      // u2 es compañero Y ya tiene hilo abierto: tiene que salir UNA vez.
      membershipFindMany
        .mockResolvedValueOnce([{ workspaceId: "w1" }])
        .mockResolvedValueOnce([
          { user: { id: "u2", email: "ana@example.com" } },
          { user: { id: "u3", email: "carlos@example.com" } },
        ]);
      participantFindMany
        .mockResolvedValueOnce([{ conversationId: "c1" }])
        .mockResolvedValueOnce([
          { user: { id: "u2", email: "ana@example.com" } },
        ]);
      const { listKnownPeople } =
        await import("../src/app/(dashboard)/chat/actions");

      const result = await listKnownPeople();

      expect(result).toEqual([
        { userId: "u2", email: "ana@example.com" },
        { userId: "u3", email: "carlos@example.com" },
      ]);
    });

    it("nunca se devuelve a uno mismo ni a cuentas sin activar", async () => {
      membershipFindMany
        .mockResolvedValueOnce([{ workspaceId: "w1" }])
        .mockResolvedValueOnce([]);
      participantFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      const { listKnownPeople } =
        await import("../src/app/(dashboard)/chat/actions");

      await expect(listKnownPeople()).resolves.toEqual([]);
      // La exclusión va DENTRO de la consulta, no filtrando después: así no
      // depende de que quien llame se acuerde de quitarse a sí mismo.
      expect(membershipFindMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: { not: "u1" },
            user: { accountPending: false },
          }),
        }),
      );
    });
  });
});
