import { describe, expect, it, vi, beforeEach } from "vitest";

const conversationFindMany = vi.fn();
vi.mock("../src/lib/prisma", () => ({
  prisma: {
    conversation: { findMany: (...args: unknown[]) => conversationFindMany(...args) },
  },
}));

describe("listConversations", () => {
  beforeEach(() => {
    conversationFindMany.mockReset();
    conversationFindMany.mockResolvedValue([]);
  });

  it("solo pide conversaciones con al menos un intercambio guardado", async () => {
    const { listConversations } = await import("../src/lib/assistantHistory");
    await listConversations("u1");

    expect(conversationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1", exchanges: { some: {} } },
      }),
    );
  });
});
