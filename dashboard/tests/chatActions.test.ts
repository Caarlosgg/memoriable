import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));
vi.mock("@/lib/blobUpload", () => ({ uploadImageToBlob: vi.fn() }));

const notifyChatParticipants =
  vi.fn<(conversationId: string, senderUserId: string, texto: string, tieneImagen: boolean) => Promise<void>>(
    async () => {},
  );
vi.mock("@/lib/chatNotifications", () => ({
  notifyChatParticipants: (conversationId: string, senderUserId: string, texto: string, tieneImagen: boolean) =>
    notifyChatParticipants(conversationId, senderUserId, texto, tieneImagen),
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

const getActiveWorkspace = vi.fn();
const isActiveMember = vi.fn();
vi.mock("@/lib/workspace", () => ({
  getActiveWorkspace: (...args: unknown[]) => getActiveWorkspace(...args),
  isActiveMember: (...args: unknown[]) => isActiveMember(...args),
}));

const participantFindUnique = vi.fn();
const participantUpsert = vi.fn();
const chatMessageDeleteMany = vi.fn();
const chatMessageCreate = vi.fn();
const chatMessageFindMany = vi.fn();
const chatMessageFindUnique = vi.fn();
const conversationFindFirst = vi.fn();
const conversationUpsert = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    chatConversationParticipant: {
      findUnique: (...args: unknown[]) => participantFindUnique(...args),
      upsert: (...args: unknown[]) => participantUpsert(...args),
      findMany: vi.fn(),
      createMany: vi.fn(),
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
      create: vi.fn(),
    },
    membership: { findMany: vi.fn(async () => []), count: vi.fn() },
  },
}));

const CONVERSACION_PROPIA = { conversation: { id: "c1", workspaceId: "w1", type: "GROUP" } };

beforeEach(() => {
  getActiveWorkspace.mockReset();
  getActiveWorkspace.mockResolvedValue({ workspaceId: "w1", isPersonal: false, role: "MEMBER" });
  isActiveMember.mockReset();
  isActiveMember.mockResolvedValue(true);
  participantFindUnique.mockReset();
  participantFindUnique.mockResolvedValue(CONVERSACION_PROPIA);
  participantUpsert.mockReset();
  chatMessageDeleteMany.mockReset();
  chatMessageCreate.mockReset();
  chatMessageFindMany.mockReset();
  chatMessageFindMany.mockResolvedValue([]);
  chatMessageFindUnique.mockReset();
  conversationFindFirst.mockReset();
  conversationUpsert.mockReset();
});

describe("deleteChatMessage", () => {
  it("borra filtrando también por autor, para no poder tocar el mensaje de otro", async () => {
    chatMessageDeleteMany.mockResolvedValue({ count: 1 });
    const { deleteChatMessage } = await import("../src/app/(dashboard)/chat/actions");
    const result = await deleteChatMessage("m1");

    expect(result.error).toBeUndefined();
    // La comprobación de autoría va DENTRO de la consulta: sin `userId` en
    // el where, un id ajeno bastaría para borrar el mensaje de otro.
    expect(chatMessageDeleteMany).toHaveBeenCalledWith({ where: { id: "m1", userId: "u1" } });
  });

  it("si el mensaje no es suyo no borra nada y lo dice, sin filtrar de quién era", async () => {
    chatMessageDeleteMany.mockResolvedValue({ count: 0 });
    const { deleteChatMessage } = await import("../src/app/(dashboard)/chat/actions");
    const result = await deleteChatMessage("m-ajeno");

    expect(result.error).toMatch(/solo puedes borrar tus propios mensajes/i);
  });

  it("ante un fallo de BD devuelve un mensaje en español, sin detalles internos", async () => {
    chatMessageDeleteMany.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1:5432"));
    const { deleteChatMessage } = await import("../src/app/(dashboard)/chat/actions");
    const result = await deleteChatMessage("m1");

    expect(result.error).toMatch(/No se ha podido borrar/);
    expect(result.error).not.toMatch(/ECONNREFUSED/);
  });
});

describe("sendChatMessage", () => {
  it("rechaza escribir en una conversación de la que no se es participante", async () => {
    participantFindUnique.mockResolvedValue(null);
    const { sendChatMessage } = await import("../src/app/(dashboard)/chat/actions");
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
    const { sendChatMessage } = await import("../src/app/(dashboard)/chat/actions");
    const result = await sendChatMessage("c1", "  hola  ");

    expect(result.message?.texto).toBe("hola");
    expect(chatMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { texto: "hola", imagenUrl: null, userId: "u1", workspaceId: "w1", conversationId: "c1" },
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
    const { sendChatMessage } = await import("../src/app/(dashboard)/chat/actions");
    await sendChatMessage("c1", "  hola  ");

    expect(notifyChatParticipants).toHaveBeenCalledWith("c1", "u1", "hola", false);
  });

  it("rechaza un mensaje vacío sin imagen", async () => {
    const { sendChatMessage } = await import("../src/app/(dashboard)/chat/actions");
    const result = await sendChatMessage("c1", "   ");

    expect(result.error).toMatch(/Escribe algo o adjunta una imagen/);
    expect(chatMessageCreate).not.toHaveBeenCalled();
  });

  it("rechaza un mensaje que pasa del límite de longitud", async () => {
    const { sendChatMessage } = await import("../src/app/(dashboard)/chat/actions");
    const result = await sendChatMessage("c1", "a".repeat(2001));

    expect(result.error).toMatch(/no puede tener más de 2000/);
    expect(chatMessageCreate).not.toHaveBeenCalled();
  });
});

describe("listChatMessages", () => {
  it("devuelve vacío (sin lanzar) si no se es participante — nunca filtra mensajes ajenos", async () => {
    participantFindUnique.mockResolvedValue(null);
    const { listChatMessages } = await import("../src/app/(dashboard)/chat/actions");

    await expect(listChatMessages("c-ajena")).resolves.toEqual([]);
    expect(chatMessageFindMany).not.toHaveBeenCalled();
  });
});

describe("createDirectConversation", () => {
  it("no deja abrir una conversación con uno mismo", async () => {
    const { createDirectConversation } = await import("../src/app/(dashboard)/chat/actions");
    const result = await createDirectConversation("u1");

    expect(result.error).toMatch(/contigo mismo/);
    expect(conversationUpsert).not.toHaveBeenCalled();
  });

  it("rechaza a quien no es miembro activo del workspace", async () => {
    isActiveMember.mockResolvedValue(false);
    const { createDirectConversation } = await import("../src/app/(dashboard)/chat/actions");
    const result = await createDirectConversation("u-fuera");

    expect(result.error).toMatch(/no es miembro de este equipo/);
    expect(conversationUpsert).not.toHaveBeenCalled();
  });

  it("usa una clave estable entre los dos participantes, para no duplicar el hilo según quién lo abra", async () => {
    conversationUpsert.mockResolvedValue({ id: "c-directa" });
    const { createDirectConversation } = await import("../src/app/(dashboard)/chat/actions");

    await createDirectConversation("u2");
    const primeraClave = conversationUpsert.mock.calls[0]![0].where.workspaceId_directKey.directKey;

    conversationUpsert.mockClear();
    // El mismo par, pero mirado desde el otro lado: la clave debe coincidir
    // (van ordenados), o cada uno abriría su propio hilo con el otro.
    vi.doMock("@/lib/dal", () => ({ verifySession: async () => "u2" }));
    vi.resetModules();
    const { createDirectConversation: crearDesdeU2 } = await import("../src/app/(dashboard)/chat/actions");
    await crearDesdeU2("u1");
    const segundaClave = conversationUpsert.mock.calls[0]![0].where.workspaceId_directKey.directKey;

    expect(primeraClave).toBe(segundaClave);
  });

  it("no está disponible en el espacio personal (no hay con quién hablar)", async () => {
    getActiveWorkspace.mockResolvedValue({ workspaceId: "w-personal", isPersonal: true, role: "OWNER" });
    const { createDirectConversation } = await import("../src/app/(dashboard)/chat/actions");
    const result = await createDirectConversation("u2");

    expect(result.error).toMatch(/espacio personal/);
  });
});

describe("ensureDefaultGroupConversation", () => {
  it("reutiliza el grupo «Equipo» existente y afilia a quien todavía no estaba dentro", async () => {
    // Alguien añadido al equipo DESPUÉS de crearse el grupo debe entrar solo,
    // sin tener que unirse a mano.
    conversationFindFirst.mockResolvedValue({ id: "c-equipo" });
    participantUpsert.mockResolvedValue({});
    const { ensureDefaultGroupConversation } = await import("../src/app/(dashboard)/chat/actions");

    await expect(ensureDefaultGroupConversation("w1", "u-nuevo")).resolves.toBe("c-equipo");
    expect(participantUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId_userId: { conversationId: "c-equipo", userId: "u-nuevo" } },
      }),
    );
  });
});
