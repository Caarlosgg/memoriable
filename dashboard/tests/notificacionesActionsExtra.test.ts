import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));

const updateMany = vi.fn();
const deleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      updateMany: (...a: unknown[]) => updateMany(...a),
      deleteMany: (...a: unknown[]) => deleteMany(...a),
    },
  },
}));

beforeEach(() => {
  updateMany.mockReset();
  updateMany.mockResolvedValue({ count: 1 });
  deleteMany.mockReset();
  deleteMany.mockResolvedValue({ count: 1 });
});

describe("markAsUnread", () => {
  it("devuelve un aviso a pendiente — abrir la bandeja no puede ser perderlo", async () => {
    // Pinchar una notificación la marca leída: sin poder deshacerlo, un
    // aviso que se abre sin tiempo de atenderlo desaparece del contador y
    // no hay forma de volver a dejarlo pendiente.
    const { markAsUnread } = await import("@/app/(dashboard)/notificaciones/actions");
    await markAsUnread("n1");

    expect(updateMany).toHaveBeenCalledWith({ where: { id: "n1", userId: "u1" }, data: { read: false } });
  });
});

describe("deleteNotification", () => {
  it("el userId va en el WHERE: un id ajeno no borra nada", async () => {
    const { deleteNotification } = await import("@/app/(dashboard)/notificaciones/actions");
    await deleteNotification("n1");

    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "n1", userId: "u1" } });
  });
});

describe("deleteReadNotifications", () => {
  it("solo borra las LEÍDAS: limpiar no puede llevarse avisos sin ver", async () => {
    const { deleteReadNotifications } = await import("@/app/(dashboard)/notificaciones/actions");
    await deleteReadNotifications();

    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "u1", read: true } });
  });
});
