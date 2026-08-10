import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));

const notificationUpdateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: { updateMany: (...args: unknown[]) => notificationUpdateMany(...args) },
  },
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));

beforeEach(() => {
  notificationUpdateMany.mockReset();
  revalidatePath.mockReset();
});

describe("markAsRead", () => {
  it("marca como leída solo la notificación propia (userId en el where)", async () => {
    const { markAsRead } = await import("../src/app/(dashboard)/notificaciones/actions");
    await markAsRead("n1");
    expect(notificationUpdateMany).toHaveBeenCalledWith({ where: { id: "n1", userId: "u1" }, data: { read: true } });
    expect(revalidatePath).toHaveBeenCalledWith("/notificaciones");
  });
});

describe("markAllAsRead", () => {
  it("marca como leídas todas las no leídas del usuario", async () => {
    const { markAllAsRead } = await import("../src/app/(dashboard)/notificaciones/actions");
    await markAllAsRead();
    expect(notificationUpdateMany).toHaveBeenCalledWith({ where: { userId: "u1", read: false }, data: { read: true } });
  });
});
