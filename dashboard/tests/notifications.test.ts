import { describe, expect, it, vi, beforeEach } from "vitest";

const notificationCreate = vi.fn();
const notificationFindMany = vi.fn();
const notificationCount = vi.fn();
const userFindUnique = vi.fn();
vi.mock("../src/lib/prisma", () => ({
  prisma: {
    notification: {
      create: (...args: unknown[]) => notificationCreate(...args),
      findMany: (...args: unknown[]) => notificationFindMany(...args),
      count: (...args: unknown[]) => notificationCount(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
  },
}));

beforeEach(() => {
  notificationCreate.mockReset();
  notificationFindMany.mockReset();
  notificationCount.mockReset();
  userFindUnique.mockReset();
  userFindUnique.mockResolvedValue({ notificationPrefs: {} });
});

describe("createNotification", () => {
  it("crea la notificación con los datos dados", async () => {
    const { createNotification } = await import("../src/lib/notifications");
    await createNotification({ userId: "u2", type: "ASSIGNED_MESSAGE", title: "Te han asignado una tarea", body: "Llamar al fontanero", link: "/notas?mensaje=m1" });
    expect(notificationCreate).toHaveBeenCalledWith({
      data: { userId: "u2", type: "ASSIGNED_MESSAGE", title: "Te han asignado una tarea", body: "Llamar al fontanero", link: "/notas?mensaje=m1" },
    });
  });

  it("no crea nada si el destinatario ha desactivado ese tipo de notificación", async () => {
    userFindUnique.mockResolvedValue({ notificationPrefs: { ASSIGNED_MESSAGE: false } });
    const { createNotification } = await import("../src/lib/notifications");
    await createNotification({ userId: "u2", type: "ASSIGNED_MESSAGE", title: "Te han asignado una tarea" });
    expect(notificationCreate).not.toHaveBeenCalled();
  });
});

describe("listNotifications", () => {
  it("pide las más recientes primero, limitadas", async () => {
    notificationFindMany.mockResolvedValue([]);
    const { listNotifications } = await import("../src/lib/notifications");
    await listNotifications("u1", 8);
    expect(notificationFindMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
  });

  it("usa 20 como límite por defecto", async () => {
    notificationFindMany.mockResolvedValue([]);
    const { listNotifications } = await import("../src/lib/notifications");
    await listNotifications("u1");
    expect(notificationFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }));
  });
});

describe("getUnreadCount", () => {
  it("cuenta solo las no leídas del usuario", async () => {
    notificationCount.mockResolvedValue(3);
    const { getUnreadCount } = await import("../src/lib/notifications");
    const result = await getUnreadCount("u1");
    expect(notificationCount).toHaveBeenCalledWith({ where: { userId: "u1", read: false } });
    expect(result).toBe(3);
  });
});
