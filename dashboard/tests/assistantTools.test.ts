import { describe, expect, it, vi, beforeEach } from "vitest";
import type { StoredMessage } from "../src/lib/botPipeline/repository";

// @sentry/nextjs de verdad es pesado de importar (arrastra instrumentación
// de OpenTelemetry) — bajo la suite completa eso llegó a hacer que el
// primer test de este archivo superase el timeout por defecto (5s), un
// fallo intermitente real, no un capricho de máquina. Se mockea, además de
// por rendimiento, porque es justo lo que pide la regla 3 de CLAUDE.md:
// nada de dependencias de servicios reales en los tests.
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const fakeSaved: StoredMessage = {
  id: "m1",
  tipo: "text",
  contenido: "Llamar al banco mañana",
  categoria: "recordatorio",
  resumen: "Llamar al banco",
  hecho: false,
  fecha: new Date("2026-08-04T10:00:00.000Z"),
  userId: "u1",
};

// El tipo declara los dos parámetros (para que la llamada tipe bien y
// toHaveBeenCalledWith los verifique), pero la implementación no los usa —
// así no quedan parámetros sin usar que el linter marque.
const captureMessage = vi.fn<(userId: string, contenido: string) => Promise<StoredMessage>>(
  async () => fakeSaved,
);
const embedQuery = vi.fn();
vi.mock("../src/lib/pipeline", () => ({
  captureMessage: (userId: string, contenido: string) => captureMessage(userId, contenido),
  resolveEmbedder: () => ({ embedQuery: (q: string) => embedQuery(q) }),
}));

const findSimilarMessages = vi.fn();
vi.mock("../src/lib/vectorSearch", () => ({
  findSimilarMessages: (...args: unknown[]) => findSimilarMessages(...args),
}));

// `revalidatePath` exige contexto de petición de Next real (Route Handler en
// marcha) — fuera de eso, incluso en producción, lanza. En el test no hay
// petición real, así que se sustituye por un espía.
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));

const fakeEvento = {
  id: "e1",
  titulo: "Cita con el médico",
  descripcion: null,
  fechaInicio: new Date("2026-08-12T10:00:00.000Z"),
  fechaFin: null,
  ubicacion: null,
  participantes: [] as string[],
  createdAt: new Date("2026-08-05T00:00:00.000Z"),
  userId: "u1",
  messageId: null,
};
const eventoCreate = vi.fn();
const eventoFindMany = vi.fn();
const eventoUpdate = vi.fn();
const eventoDelete = vi.fn();
const messageFindFirst = vi.fn();
const messageUpdate = vi.fn();
const cuentaAhorroFindMany = vi.fn();
const cuentaAhorroCreate = vi.fn();
const movimientoAhorroCreate = vi.fn();
vi.mock("../src/lib/prisma", () => ({
  prisma: {
    evento: {
      create: (...args: unknown[]) => eventoCreate(...args),
      findMany: (...args: unknown[]) => eventoFindMany(...args),
      update: (...args: unknown[]) => eventoUpdate(...args),
      delete: (...args: unknown[]) => eventoDelete(...args),
    },
    message: {
      findFirst: (...args: unknown[]) => messageFindFirst(...args),
      update: (...args: unknown[]) => messageUpdate(...args),
    },
    cuentaAhorro: {
      findMany: (...args: unknown[]) => cuentaAhorroFindMany(...args),
      create: (...args: unknown[]) => cuentaAhorroCreate(...args),
    },
    movimientoAhorro: { create: (...args: unknown[]) => movimientoAhorroCreate(...args) },
  },
}));

const getCuentasConSaldo = vi.fn();
vi.mock("../src/lib/ahorros", () => ({
  getCuentasConSaldo: (...args: unknown[]) => getCuentasConSaldo(...args),
}));

function fakePendiente(overrides: Partial<import("@prisma/client").Message> = {}) {
  return {
    id: "p1",
    tipo: "text",
    contenido: "Llamar al fontanero para revisar la caldera",
    categoria: "tarea",
    resumen: "Llamar al fontanero",
    hecho: false,
    estado: "POR_HACER",
    prioridad: "MEDIA",
    etiquetas: [] as string[],
    camposExtra: {},
    fecha: new Date("2026-08-01T00:00:00.000Z"),
    userId: "u1",
    ...overrides,
  };
}

describe("createAssistantTools", () => {
  beforeEach(() => {
    captureMessage.mockReset();
    captureMessage.mockResolvedValue(fakeSaved);
    revalidatePath.mockReset();
    eventoCreate.mockReset();
    eventoCreate.mockResolvedValue(fakeEvento);
    embedQuery.mockReset();
    embedQuery.mockResolvedValue([0.1, 0.2, 0.3]);
    findSimilarMessages.mockReset();
    findSimilarMessages.mockResolvedValue([]);
    messageFindFirst.mockReset();
    messageFindFirst.mockResolvedValue(null);
    messageUpdate.mockReset();
    messageUpdate.mockResolvedValue({});
    cuentaAhorroFindMany.mockReset();
    cuentaAhorroFindMany.mockResolvedValue([]);
    cuentaAhorroCreate.mockReset();
    movimientoAhorroCreate.mockReset();
    movimientoAhorroCreate.mockResolvedValue({});
    eventoFindMany.mockReset();
    eventoFindMany.mockResolvedValue([]);
    eventoUpdate.mockReset();
    eventoDelete.mockReset();
    getCuentasConSaldo.mockReset();
    getCuentasConSaldo.mockResolvedValue([]);
  });

  it("crearNota guarda el contenido con el mismo pipeline que la captura rápida, ligado al usuario de la sesión, e invalida Tablero/Categorías", async () => {
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    const result = await tools.crearNota.execute!(
      { contenido: "Llamar al banco mañana" },
      { toolCallId: "call-1", messages: [], context: undefined },
    );

    expect(captureMessage).toHaveBeenCalledWith("u1", "Llamar al banco mañana");
    expect(result).toMatchObject({
      id: "m1",
      categoria: "recordatorio",
      label: "Recordatorios",
      resumen: "Llamar al banco",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/pendientes");
    expect(revalidatePath).toHaveBeenCalledWith("/categorias");
  });

  it("ante un fallo al guardar, lanza un mensaje en español sin filtrar detalles internos", async () => {
    captureMessage.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1:5432 supabase pooler"));
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    await expect(
      tools.crearNota.execute!({ contenido: "algo" }, { toolCallId: "c", messages: [], context: undefined }),
    ).rejects.toThrow(/No se ha podido guardar la nota/);

    // El detalle interno (host/puerto de la BD) no debe salir en el mensaje.
    await expect(
      tools.crearNota.execute!({ contenido: "algo" }, { toolCallId: "c", messages: [], context: undefined }),
    ).rejects.not.toThrow(/ECONNREFUSED|supabase|5432/);
  });

  it("un fallo al invalidar la caché NO tumba un guardado correcto", async () => {
    revalidatePath.mockImplementation(() => {
      throw new Error("revalidatePath fuera de contexto de petición");
    });
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    const result = await tools.crearNota.execute!(
      { contenido: "Llamar al banco" },
      { toolCallId: "c", messages: [], context: undefined },
    );
    // La nota se guardó: se devuelve la fuente igualmente.
    expect(result).toMatchObject({ id: "m1", label: "Recordatorios" });
  });

  it("crearEvento guarda la cita ligada al usuario de la sesión e invalida /calendario", async () => {
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    const result = await tools.crearEvento.execute!(
      { titulo: "Cita con el médico", fechaInicio: "2026-08-12T10:00:00.000Z" },
      { toolCallId: "call-1", messages: [], context: undefined },
    );

    expect(eventoCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1", titulo: "Cita con el médico" }) }),
    );
    expect(result).toMatchObject({ id: "e1", titulo: "Cita con el médico" });
    expect(revalidatePath).toHaveBeenCalledWith("/calendario");
  });

  it("crearEvento rechaza una fecha de inicio que no se puede interpretar", async () => {
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    await expect(
      tools.crearEvento.execute!(
        { titulo: "Algo", fechaInicio: "no-es-una-fecha" },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he entendido bien la fecha/);
    expect(eventoCreate).not.toHaveBeenCalled();
  });

  it("crearEvento: ante un fallo al guardar, lanza un mensaje en español sin detalles internos", async () => {
    eventoCreate.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1:5432 supabase pooler"));
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    await expect(
      tools.crearEvento.execute!(
        { titulo: "Algo", fechaInicio: "2026-08-12T10:00:00.000Z" },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No se ha podido guardar el evento/);
  });

  it("crearEvento: un fallo al invalidar la caché NO tumba un guardado correcto", async () => {
    revalidatePath.mockImplementation(() => {
      throw new Error("revalidatePath fuera de contexto de petición");
    });
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    const result = await tools.crearEvento.execute!(
      { titulo: "Cita con el médico", fechaInicio: "2026-08-12T10:00:00.000Z" },
      { toolCallId: "c", messages: [], context: undefined },
    );
    expect(result).toMatchObject({ id: "e1" });
  });

  it("completarTarea encuentra la pendiente por similitud semántica (aunque no repita el texto exacto) y la marca hecha", async () => {
    findSimilarMessages.mockResolvedValue([fakePendiente({ id: "p1", resumen: "Llamar al fontanero" })]);
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    const result = await tools.completarTarea.execute!(
      { descripcion: "ya he llamado al fontanero" },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(embedQuery).toHaveBeenCalledWith("ya he llamado al fontanero");
    expect(messageUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { estado: "HECHO", hecho: true },
    });
    expect(result).toMatchObject({ id: "p1", resumen: "Llamar al fontanero" });
  });

  it("completarTarea ignora candidatos semánticos que ya están hechos o no son accionables", async () => {
    findSimilarMessages.mockResolvedValue([
      fakePendiente({ id: "ya-hecha", estado: "HECHO" }),
      fakePendiente({ id: "no-accionable", categoria: "idea" }),
      fakePendiente({ id: "la-buena" }),
    ]);
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    const result = await tools.completarTarea.execute!(
      { descripcion: "algo" },
      { toolCallId: "c", messages: [], context: undefined },
    );
    expect(result).toMatchObject({ id: "la-buena" });
  });

  it("completarTarea cae a búsqueda de texto si no hay embedder (embedQuery devuelve null)", async () => {
    embedQuery.mockResolvedValue(null);
    messageFindFirst.mockResolvedValue(fakePendiente({ id: "p2" }));
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    const result = await tools.completarTarea.execute!(
      { descripcion: "fontanero" },
      { toolCallId: "c", messages: [], context: undefined },
    );
    expect(findSimilarMessages).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: "p2" });
  });

  it("completarTarea lanza (en español) si no encuentra ninguna coincidencia", async () => {
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    await expect(
      tools.completarTarea.execute!(
        { descripcion: "algo que no existe" },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he encontrado ninguna tarea pendiente/);
    expect(messageUpdate).not.toHaveBeenCalled();
  });

  it("completarTarea: un fallo al invalidar la caché NO tumba una tarea ya marcada como hecha", async () => {
    findSimilarMessages.mockResolvedValue([fakePendiente({ id: "p3" })]);
    revalidatePath.mockImplementation(() => {
      throw new Error("revalidatePath fuera de contexto de petición");
    });
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    const result = await tools.completarTarea.execute!(
      { descripcion: "algo" },
      { toolCallId: "c", messages: [], context: undefined },
    );
    expect(messageUpdate).toHaveBeenCalled();
    expect(result).toMatchObject({ id: "p3" });
  });

  it("registrarAhorro guarda el movimiento en una cuenta existente que coincide por nombre", async () => {
    cuentaAhorroFindMany.mockResolvedValue([{ id: "c1", nombre: "Fondo de emergencia", userId: "u1" }]);
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    const result = await tools.registrarAhorro.execute!(
      { cuenta: "fondo de emergencia", importe: 50 },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(cuentaAhorroCreate).not.toHaveBeenCalled();
    expect(movimientoAhorroCreate).toHaveBeenCalledWith({
      data: { cuentaId: "c1", centimos: 5000, concepto: null },
    });
    expect(result).toMatchObject({ cuentaId: "c1", cuentaNombre: "Fondo de emergencia", centimos: 5000, cuentaCreada: false });
    expect(revalidatePath).toHaveBeenCalledWith("/ahorros");
  });

  it("registrarAhorro crea la cuenta sobre la marcha si no hay ninguna parecida", async () => {
    cuentaAhorroFindMany.mockResolvedValue([]);
    cuentaAhorroCreate.mockResolvedValue({ id: "c2", nombre: "Viaje a Japón", userId: "u1" });
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    const result = await tools.registrarAhorro.execute!(
      { cuenta: "Viaje a Japón", importe: 20, concepto: "paga extra" },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(cuentaAhorroCreate).toHaveBeenCalledWith({ data: { userId: "u1", nombre: "Viaje a Japón" } });
    expect(movimientoAhorroCreate).toHaveBeenCalledWith({
      data: { cuentaId: "c2", centimos: 2000, concepto: "paga extra" },
    });
    expect(result).toMatchObject({ cuentaId: "c2", cuentaNombre: "Viaje a Japón", centimos: 2000, cuentaCreada: true });
  });

  it("registrarAhorro acepta un importe negativo como retirada", async () => {
    cuentaAhorroFindMany.mockResolvedValue([{ id: "c1", nombre: "Viaje", userId: "u1" }]);
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    const result = await tools.registrarAhorro.execute!(
      { cuenta: "viaje", importe: -15 },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(movimientoAhorroCreate).toHaveBeenCalledWith({
      data: { cuentaId: "c1", centimos: -1500, concepto: null },
    });
    expect(result).toMatchObject({ centimos: -1500 });
  });

  it("registrarAhorro rechaza un importe que redondea a cero", async () => {
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    await expect(
      tools.registrarAhorro.execute!(
        { cuenta: "viaje", importe: 0 },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he entendido el importe/);
    expect(cuentaAhorroFindMany).not.toHaveBeenCalled();
  });

  it("registrarAhorro: ante un fallo al buscar/crear la cuenta, lanza un mensaje en español sin detalles internos", async () => {
    cuentaAhorroFindMany.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1:5432 supabase pooler"));
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    await expect(
      tools.registrarAhorro.execute!(
        { cuenta: "viaje", importe: 10 },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he podido buscar tus cuentas de ahorro/);
    expect(movimientoAhorroCreate).not.toHaveBeenCalled();
  });

  it("registrarAhorro: ante un fallo al guardar el movimiento, lanza un mensaje en español sin detalles internos", async () => {
    cuentaAhorroFindMany.mockResolvedValue([{ id: "c1", nombre: "Viaje", userId: "u1" }]);
    movimientoAhorroCreate.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1:5432 supabase pooler"));
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    await expect(
      tools.registrarAhorro.execute!(
        { cuenta: "viaje", importe: 10 },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No se ha podido guardar el movimiento/);
  });

  it("registrarAhorro: un fallo al invalidar la caché NO tumba un movimiento ya guardado", async () => {
    cuentaAhorroFindMany.mockResolvedValue([{ id: "c1", nombre: "Viaje", userId: "u1" }]);
    revalidatePath.mockImplementation(() => {
      throw new Error("revalidatePath fuera de contexto de petición");
    });
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    const result = await tools.registrarAhorro.execute!(
      { cuenta: "viaje", importe: 10 },
      { toolCallId: "c", messages: [], context: undefined },
    );
    expect(movimientoAhorroCreate).toHaveBeenCalled();
    expect(result).toMatchObject({ cuentaId: "c1" });
  });

  it("editarEvento busca solo entre eventos futuros (hoy incluido) y cambia los campos dados", async () => {
    eventoFindMany.mockResolvedValue([fakeEvento]);
    eventoUpdate.mockResolvedValue({ ...fakeEvento, titulo: "Cita con el médico", fechaInicio: new Date("2026-08-13T17:00:00.000Z") });
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    const result = await tools.editarEvento.execute!(
      { descripcion: "cita con el médico", fechaInicioNueva: "2026-08-13T17:00:00.000Z" },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(eventoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "u1" }) }),
    );
    expect(eventoUpdate).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { fechaInicio: new Date("2026-08-13T17:00:00.000Z") },
    });
    expect(result).toMatchObject({ id: "e1", fechaInicio: "2026-08-13T17:00:00.000Z" });
    expect(revalidatePath).toHaveBeenCalledWith("/calendario");
  });

  it("editarEvento encuentra el evento aunque las tildes no coincidan (guardado con tilde, descripción sin ella o al revés)", async () => {
    eventoFindMany.mockResolvedValue([{ ...fakeEvento, titulo: "Reunión de seguimiento" }]);
    eventoUpdate.mockResolvedValue({ ...fakeEvento, titulo: "Reunión de seguimiento" });
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    const result = await tools.editarEvento.execute!(
      { descripcion: "la reunion de seguimiento", tituloNuevo: "Reunión de seguimiento (aplazada)" },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(eventoUpdate).toHaveBeenCalled();
    expect(result).toMatchObject({ id: "e1" });
  });

  it("editarEvento lanza si no encuentra ningún evento que coincida", async () => {
    eventoFindMany.mockResolvedValue([]);
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    await expect(
      tools.editarEvento.execute!(
        { descripcion: "algo que no existe", tituloNuevo: "X" },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he encontrado ningún evento/);
    expect(eventoUpdate).not.toHaveBeenCalled();
  });

  it("editarEvento lanza si no se le da ningún campo que cambiar", async () => {
    eventoFindMany.mockResolvedValue([fakeEvento]);
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    await expect(
      tools.editarEvento.execute!(
        { descripcion: "cita con el médico" },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/qué cambiar/);
    expect(eventoUpdate).not.toHaveBeenCalled();
  });

  it("editarEvento rechaza una fecha nueva que no se puede interpretar", async () => {
    eventoFindMany.mockResolvedValue([fakeEvento]);
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    await expect(
      tools.editarEvento.execute!(
        { descripcion: "cita con el médico", fechaInicioNueva: "no-es-una-fecha" },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he entendido bien la nueva fecha/);
    expect(eventoUpdate).not.toHaveBeenCalled();
  });

  it("borrarEvento encuentra y borra el evento que coincide", async () => {
    eventoFindMany.mockResolvedValue([fakeEvento]);
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    const result = await tools.borrarEvento.execute!(
      { descripcion: "médico" },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(eventoDelete).toHaveBeenCalledWith({ where: { id: "e1" } });
    expect(result).toMatchObject({ id: "e1", titulo: "Cita con el médico" });
    expect(revalidatePath).toHaveBeenCalledWith("/calendario");
  });

  it("borrarEvento lanza si no encuentra ningún evento que coincida", async () => {
    eventoFindMany.mockResolvedValue([]);
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    await expect(
      tools.borrarEvento.execute!(
        { descripcion: "algo que no existe" },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he encontrado ningún evento/);
    expect(eventoDelete).not.toHaveBeenCalled();
  });

  it("borrarEvento: ante un fallo al borrar, lanza un mensaje en español sin detalles internos", async () => {
    eventoFindMany.mockResolvedValue([fakeEvento]);
    eventoDelete.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1:5432"));
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    await expect(
      tools.borrarEvento.execute!({ descripcion: "médico" }, { toolCallId: "c", messages: [], context: undefined }),
    ).rejects.toThrow(/No se ha podido borrar el evento/);
  });

  it("consultarAhorros sin nombre de cuenta devuelve todas con el total", async () => {
    getCuentasConSaldo.mockResolvedValue([
      { id: "c1", nombre: "Viaje", saldoCentimos: 5000, objetivoCentimos: null, createdAt: new Date(), userId: "u1" },
      { id: "c2", nombre: "Fondo de emergencia", saldoCentimos: 12000, objetivoCentimos: null, createdAt: new Date(), userId: "u1" },
    ]);
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    const result = await tools.consultarAhorros.execute!({}, { toolCallId: "c", messages: [], context: undefined });

    expect(result).toEqual({
      cuentas: [
        { nombre: "Viaje", saldoCentimos: 5000 },
        { nombre: "Fondo de emergencia", saldoCentimos: 12000 },
      ],
      totalCentimos: 17000,
    });
  });

  it("consultarAhorros con nombre de cuenta devuelve solo esa (coincidencia parcial)", async () => {
    getCuentasConSaldo.mockResolvedValue([
      { id: "c1", nombre: "Fondo de emergencia", saldoCentimos: 12000, objetivoCentimos: null, createdAt: new Date(), userId: "u1" },
    ]);
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    const result = await tools.consultarAhorros.execute!(
      { cuenta: "emergencia" },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(result).toEqual({ cuentas: [{ nombre: "Fondo de emergencia", saldoCentimos: 12000 }], totalCentimos: 12000 });
  });

  it("consultarAhorros lanza si pregunta por una cuenta que no existe", async () => {
    getCuentasConSaldo.mockResolvedValue([]);
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    await expect(
      tools.consultarAhorros.execute!({ cuenta: "inventada" }, { toolCallId: "c", messages: [], context: undefined }),
    ).rejects.toThrow(/No encuentro ninguna cuenta/);
  });

  it("consultarAhorros: ante un fallo al leer, lanza un mensaje en español sin detalles internos", async () => {
    getCuentasConSaldo.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1:5432"));
    const { createAssistantTools } = await import("../src/lib/assistantTools");
    const tools = createAssistantTools("u1");

    await expect(
      tools.consultarAhorros.execute!({}, { toolCallId: "c", messages: [], context: undefined }),
    ).rejects.toThrow(/No he podido consultar tus ahorros/);
  });
});
