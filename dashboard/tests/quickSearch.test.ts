import { describe, expect, it, vi, beforeEach } from "vitest";

const messageFindMany = vi.fn();
const eventoFindMany = vi.fn();
const cuentaFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: { findMany: (...args: unknown[]) => messageFindMany(...args) },
    evento: { findMany: (...args: unknown[]) => eventoFindMany(...args) },
    cuentaAhorro: { findMany: (...args: unknown[]) => cuentaFindMany(...args) },
  },
}));

describe("searchAcrossAll", () => {
  beforeEach(() => {
    messageFindMany.mockReset();
    messageFindMany.mockResolvedValue([]);
    eventoFindMany.mockReset();
    eventoFindMany.mockResolvedValue([]);
    cuentaFindMany.mockReset();
    cuentaFindMany.mockResolvedValue([]);
  });

  it("no consulta nada con menos de 2 caracteres (evita ruido en cada tecleo)", async () => {
    const { searchAcrossAll } = await import("../src/lib/quickSearch");
    const result = await searchAcrossAll("u1", "a");

    expect(result).toEqual([]);
    expect(messageFindMany).not.toHaveBeenCalled();
  });

  it("busca en notas, eventos y cuentas de ahorro ligado al usuario", async () => {
    const { searchAcrossAll } = await import("../src/lib/quickSearch");
    await searchAcrossAll("u1", "fontanero");

    expect(messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "u1" }) }),
    );
    expect(eventoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "u1", titulo: expect.anything() }) }),
    );
    expect(cuentaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "u1", nombre: expect.anything() }) }),
    );
  });

  it("mapea cada tipo a un resultado con href navegable", async () => {
    messageFindMany.mockResolvedValue([
      { id: "m1", resumen: "Llamar al fontanero", categoria: "tarea" },
    ]);
    eventoFindMany.mockResolvedValue([{ id: "e1", titulo: "Cita con el fontanero" }]);
    cuentaFindMany.mockResolvedValue([{ id: "c1", nombre: "Fondo fontanero" }]);

    const { searchAcrossAll } = await import("../src/lib/quickSearch");
    const result = await searchAcrossAll("u1", "fontanero");

    expect(result).toEqual([
      { id: "m1", tipo: "nota", titulo: "Llamar al fontanero", subtitulo: "tarea", href: "/categorias?mensaje=m1#mensaje-m1" },
      { id: "e1", tipo: "evento", titulo: "Cita con el fontanero", subtitulo: "Evento", href: "/calendario" },
      { id: "c1", tipo: "ahorro", titulo: "Fondo fontanero", subtitulo: "Cuenta de ahorro", href: "/ahorros" },
    ]);
  });

  it("recorta el total combinado a 8 resultados", async () => {
    messageFindMany.mockResolvedValue(
      Array.from({ length: 4 }, (_, i) => ({ id: `m${i}`, resumen: `nota ${i}`, categoria: "idea" })),
    );
    eventoFindMany.mockResolvedValue(Array.from({ length: 4 }, (_, i) => ({ id: `e${i}`, titulo: `evento ${i}` })));
    cuentaFindMany.mockResolvedValue(Array.from({ length: 4 }, (_, i) => ({ id: `c${i}`, nombre: `cuenta ${i}` })));

    const { searchAcrossAll } = await import("../src/lib/quickSearch");
    const result = await searchAcrossAll("u1", "algo");

    expect(result.length).toBe(8);
  });
});
