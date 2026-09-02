import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const comentarioFindMany = vi.fn();
const comentarioCreate = vi.fn();
const comentarioUpdateMany = vi.fn();
const comentarioDeleteMany = vi.fn();
const comentarioGroupBy = vi.fn();
const membershipFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    comentario: {
      findMany: (...a: unknown[]) => comentarioFindMany(...a),
      create: (...a: unknown[]) => comentarioCreate(...a),
      updateMany: (...a: unknown[]) => comentarioUpdateMany(...a),
      deleteMany: (...a: unknown[]) => comentarioDeleteMany(...a),
      groupBy: (...a: unknown[]) => comentarioGroupBy(...a),
    },
    membership: { findMany: (...a: unknown[]) => membershipFindMany(...a) },
  },
}));

const createNotification = vi.fn();
vi.mock("@/lib/notifications", () => ({
  createNotification: (...a: unknown[]) => createNotification(...a),
}));

beforeEach(() => {
  comentarioFindMany.mockReset();
  comentarioCreate.mockReset();
  comentarioUpdateMany.mockReset();
  comentarioDeleteMany.mockReset();
  comentarioGroupBy.mockReset();
  membershipFindMany.mockReset();
  membershipFindMany.mockResolvedValue([]);
  createNotification.mockReset();
  createNotification.mockResolvedValue(undefined);
});

const fila = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  texto: "Un comentario",
  createdAt: new Date("2026-09-02T10:00:00Z"),
  editadoAt: null,
  userId: "u1",
  user: { email: "carlos@ejemplo.com" },
  ...over,
});

describe("listComentarios", () => {
  it("pide el hilo en orden de lectura (más antiguo primero), no de bandeja", async () => {
    comentarioFindMany.mockResolvedValue([fila()]);
    const { listComentarios } = await import("../src/lib/comentarios");

    await listComentarios({ messageId: "m1" }, "u1");

    expect(comentarioFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { messageId: "m1" }, orderBy: { createdAt: "asc" } }),
    );
  });

  it("marca como propios solo los del usuario que mira", async () => {
    comentarioFindMany.mockResolvedValue([
      fila({ id: "c1", userId: "u1" }),
      fila({ id: "c2", userId: "u2", user: { email: "otra@ejemplo.com" } }),
    ]);
    const { listComentarios } = await import("../src/lib/comentarios");

    const result = await listComentarios({ messageId: "m1" }, "u1");

    expect(result[0]!.esMio).toBe(true);
    expect(result[1]!.esMio).toBe(false);
  });
});

describe("createComentario", () => {
  const base = {
    target: { messageId: "m1" } as const,
    workspaceId: "ws1",
    userId: "u1",
    contexto: "Resumen de la nota",
    link: "/notas?mensaje=m1",
  };

  it("rechaza un comentario vacío sin tocar la base de datos", async () => {
    const { createComentario } = await import("../src/lib/comentarios");
    const result = await createComentario({ ...base, texto: "   " });

    expect(result.error).toMatch(/escribe algo/i);
    expect(comentarioCreate).not.toHaveBeenCalled();
  });

  it("rechaza uno demasiado largo", async () => {
    const { createComentario, COMENTARIO_MAX_LENGTH } = await import("../src/lib/comentarios");
    const result = await createComentario({ ...base, texto: "x".repeat(COMENTARIO_MAX_LENGTH + 1) });

    expect(result.error).toMatch(/no puede tener más de/i);
    expect(comentarioCreate).not.toHaveBeenCalled();
  });

  it("guarda recortando y devuelve la vista con el id real", async () => {
    comentarioCreate.mockResolvedValue(fila({ texto: "Hola" }));
    const { createComentario } = await import("../src/lib/comentarios");

    const result = await createComentario({ ...base, texto: "  Hola  " });

    expect(comentarioCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { texto: "Hola", userId: "u1", workspaceId: "ws1", messageId: "m1" },
      }),
    );
    expect(result.comentario?.id).toBe("c1");
  });

  it("cuelga del evento cuando el destino es un evento, no de una nota", async () => {
    comentarioCreate.mockResolvedValue(fila());
    const { createComentario } = await import("../src/lib/comentarios");

    await createComentario({ ...base, target: { eventoId: "e1" }, texto: "Hola" });

    expect(comentarioCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventoId: "e1" }) }),
    );
  });
});

describe("menciones", () => {
  it("avisa solo a los miembros ACTIVOS mencionados, nunca al propio autor", async () => {
    comentarioCreate.mockResolvedValue(fila({ texto: "@ana @carlos mirad esto" }));
    membershipFindMany.mockResolvedValue([
      { userId: "u2", user: { id: "u2", email: "ana@ejemplo.com" } },
      { userId: "u1", user: { id: "u1", email: "carlos@ejemplo.com" } },
    ]);
    const { createComentario } = await import("../src/lib/comentarios");

    await createComentario({
      target: { messageId: "m1" },
      workspaceId: "ws1",
      userId: "u1",
      texto: "@ana @carlos mirad esto",
      contexto: "Resumen",
      link: "/notas?mensaje=m1",
    });
    // notificarMenciones va en `void` (no bloquea la respuesta) — se deja
    // vaciar la cola de microtareas antes de comprobar.
    await new Promise((r) => setTimeout(r, 0));

    // Se menciona a los dos, pero "carlos" es el autor: solo se avisa a ana.
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "u2" }));
  });

  it("sin menciones no consulta miembros ni avisa a nadie", async () => {
    comentarioCreate.mockResolvedValue(fila({ texto: "Sin menciones" }));
    const { createComentario } = await import("../src/lib/comentarios");

    await createComentario({
      target: { messageId: "m1" },
      workspaceId: "ws1",
      userId: "u1",
      texto: "Sin menciones",
      contexto: "Resumen",
      link: "/notas?mensaje=m1",
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(membershipFindMany).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("un email mencionado que no está en el workspace no recibe aviso", async () => {
    // Mencionar a alguien que no está en el equipo no debe avisarle de un
    // trabajo que no puede ver.
    comentarioCreate.mockResolvedValue(fila({ texto: "@ajeno mira" }));
    membershipFindMany.mockResolvedValue([
      { userId: "u2", user: { id: "u2", email: "ana@ejemplo.com" } },
    ]);
    const { createComentario } = await import("../src/lib/comentarios");

    await createComentario({
      target: { messageId: "m1" },
      workspaceId: "ws1",
      userId: "u1",
      texto: "@ajeno mira",
      contexto: "Resumen",
      link: "/notas?mensaje=m1",
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe("updateComentario", () => {
  it("filtra por autor en el where, no con un if después de leer", async () => {
    comentarioUpdateMany.mockResolvedValue({ count: 1 });
    const { updateComentario } = await import("../src/lib/comentarios");

    await updateComentario("c1", "u1", "Corregido");

    expect(comentarioUpdateMany).toHaveBeenCalledWith({
      where: { id: "c1", userId: "u1" },
      data: { texto: "Corregido", editadoAt: expect.any(Date) },
    });
  });

  it("con un comentario ajeno dice que no existe, sin filtrar de quién era", async () => {
    comentarioUpdateMany.mockResolvedValue({ count: 0 });
    const { updateComentario } = await import("../src/lib/comentarios");

    const result = await updateComentario("c-ajeno", "u1", "Corregido");

    expect(result.error).toMatch(/no existe o no es tuyo/i);
  });

  it("rechaza dejarlo vacío", async () => {
    const { updateComentario } = await import("../src/lib/comentarios");
    const result = await updateComentario("c1", "u1", "   ");

    expect(result.error).toMatch(/no puede quedar vacío/i);
    expect(comentarioUpdateMany).not.toHaveBeenCalled();
  });
});

describe("deleteComentario", () => {
  it("borra filtrando por autor", async () => {
    comentarioDeleteMany.mockResolvedValue({ count: 1 });
    const { deleteComentario } = await import("../src/lib/comentarios");

    const result = await deleteComentario("c1", "u1");

    expect(comentarioDeleteMany).toHaveBeenCalledWith({ where: { id: "c1", userId: "u1" } });
    expect(result.error).toBeUndefined();
  });

  it("con uno ajeno no borra nada y lo dice", async () => {
    comentarioDeleteMany.mockResolvedValue({ count: 0 });
    const { deleteComentario } = await import("../src/lib/comentarios");

    const result = await deleteComentario("c-ajeno", "u1");

    expect(result.error).toMatch(/no existe o no es tuyo/i);
  });
});

describe("contarComentariosPorMensaje", () => {
  it("con una lista vacía no consulta nada", async () => {
    const { contarComentariosPorMensaje } = await import("../src/lib/comentarios");

    const result = await contarComentariosPorMensaje([]);

    expect(comentarioGroupBy).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });

  it("agrupa en UNA consulta, no una por nota", async () => {
    comentarioGroupBy.mockResolvedValue([
      { messageId: "m1", _count: { _all: 3 } },
      { messageId: "m2", _count: { _all: 1 } },
    ]);
    const { contarComentariosPorMensaje } = await import("../src/lib/comentarios");

    const result = await contarComentariosPorMensaje(["m1", "m2", "m3"]);

    expect(comentarioGroupBy).toHaveBeenCalledTimes(1);
    expect(result.get("m1")).toBe(3);
    expect(result.get("m2")).toBe(1);
    expect(result.get("m3")).toBeUndefined();
  });
});
