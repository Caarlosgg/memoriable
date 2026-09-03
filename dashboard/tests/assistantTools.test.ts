import { describe, expect, it, vi, beforeEach } from "vitest";
// Import ESTÁTICO a propósito: `vi.mock` lo hoistea Vitest por encima de
// los imports, así que no hace falta el `await import()` dentro de cada
// test (y este archivo no usa `vi.doMock`/`resetModules`, que sería el
// único motivo real para hacerlo dinámico).
//
// Con el import dentro del primer `it()`, compilar este módulo (Prisma, el
// pipeline, la búsqueda vectorial, el contexto de equipo) se le cargaba al
// presupuesto de tiempo de ESE test — que con la suite entera en paralelo
// hacía saltar el timeout de forma intermitente en un test de una función
// pura. Estáticamente, ese coste se paga al recolectar, fuera del timeout.
import {
  createAssistantTools,
  resolverMiembro,
} from "../src/lib/assistantTools";
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

// El tipo declara los tres parámetros (para que la llamada tipe bien y
// toHaveBeenCalledWith los verifique), pero la implementación no los usa —
// así no quedan parámetros sin usar que el linter marque.
const captureMessage = vi.fn<
  (
    userId: string,
    contenido: string,
    workspaceId: string,
  ) => Promise<StoredMessage>
>(async () => fakeSaved);
const embedQuery = vi.fn();
vi.mock("../src/lib/pipeline", () => ({
  captureMessage: (userId: string, contenido: string, workspaceId: string) =>
    captureMessage(userId, contenido, workspaceId),
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
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

// Roster de equipo para las tools que resuelven `asignadoA` — ver el
// comentario de `createAssistantTools` en assistantTools.ts: ya no vuelve a
// consultar la BD por su cuenta, se le pasa como 4º argumento.
const TEAM_MEMBERS = [
  { userId: "u-benito", email: "benitoelrey@example.com", isSelf: false },
  { userId: "u-ana", email: "ana@example.com", isSelf: false },
];

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
const eventoUpdateMany = vi.fn();
const eventoDeleteMany = vi.fn();
const messageFindFirst = vi.fn();
const messageFindMany = vi.fn();
const messageUpdateMany = vi.fn();
const messageUpdate = vi.fn();
const cuentaAhorroFindMany = vi.fn();
const cuentaAhorroCreate = vi.fn();
const movimientoAhorroCreate = vi.fn();
vi.mock("../src/lib/prisma", () => ({
  prisma: {
    evento: {
      create: (...args: unknown[]) => eventoCreate(...args),
      findMany: (...args: unknown[]) => eventoFindMany(...args),
      updateMany: (...args: unknown[]) => eventoUpdateMany(...args),
      deleteMany: (...args: unknown[]) => eventoDeleteMany(...args),
    },
    message: {
      findFirst: (...args: unknown[]) => messageFindFirst(...args),
      findMany: (...args: unknown[]) => messageFindMany(...args),
      updateMany: (...args: unknown[]) => messageUpdateMany(...args),
      update: (...args: unknown[]) => messageUpdate(...args),
    },
    cuentaAhorro: {
      findMany: (...args: unknown[]) => cuentaAhorroFindMany(...args),
      create: (...args: unknown[]) => cuentaAhorroCreate(...args),
    },
    movimientoAhorro: {
      create: (...args: unknown[]) => movimientoAhorroCreate(...args),
    },
  },
}));

const getCuentasConSaldo = vi.fn();
vi.mock("../src/lib/ahorros", () => ({
  getCuentasConSaldo: (...args: unknown[]) => getCuentasConSaldo(...args),
}));

function fakePendiente(
  overrides: Partial<import("@prisma/client").Message> = {},
) {
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

describe("resolverMiembro", () => {
  // La lógica de coincidencia vive en `matchPersonaPorEmail` (textMatch.ts) y
  // se prueba a fondo allí, sin arrastrar todo el grafo de assistantTools.
  // Aquí solo se comprueba que `resolverMiembro` delega de verdad — que es
  // lo único que puede romperse en este módulo.
  it("delega en el criterio compartido de coincidencia por email", async () => {
    const members = [
      { userId: "u-benito", email: "benitoelrey@example.com", isSelf: false },
      { userId: "u-ana", email: "ana.garcia@example.com", isSelf: false },
    ];
    expect(resolverMiembro("benitoelrey", members)).toMatchObject({
      userId: "u-benito",
    });
    expect(resolverMiembro("pedro", members)).toBeNull();
  });
});

describe("createAssistantTools — poda por modo", () => {
  // Las únicas que de verdad no pueden funcionar sin compañeros de equipo:
  // o lanzan con `members.length === 0`, o resuelven un nombre contra
  // `members`.
  const REQUIEREN_EQUIPO = [
    "asignarTarea",
    "consultarEquipo",
    "analizarEquipo",
    "comentarEnTarea",
  ];

  it("en personal no incluye las que necesitan compañeros de equipo", () => {
    const tools = createAssistantTools("u1", "w1", "MEMBER");
    for (const nombre of REQUIEREN_EQUIPO)
      expect(tools).not.toHaveProperty(nombre);
  });

  it("en equipo sí incluye las que necesitan compañeros de equipo", () => {
    const tools = createAssistantTools("u1", "w1", "MEMBER", TEAM_MEMBERS);
    for (const nombre of REQUIEREN_EQUIPO) expect(tools).toHaveProperty(nombre);
  });

  it("buscarNotas está en los DOS modos: era el hueco más grave que tenía el Asistente", () => {
    // Si el RAG inicial no traía la nota buena, el modelo NO PODÍA volver a
    // buscar: se quedaba respondiendo de memoria o admitiendo que no sabía,
    // teniendo el dato guardado a un query de distancia.
    expect(createAssistantTools("u1", "w1", "MEMBER")).toHaveProperty("buscarNotas");
    expect(createAssistantTools("u1", "w1", "VIEWER", TEAM_MEMBERS)).toHaveProperty("buscarNotas");
  });

  // Regresión real: una poda anterior se llevó por delante estas cuatro
  // creyéndolas "de equipo" o "de personal", y el Asistente se quedaba sin
  // nada que llamar ante "¿qué lleva Carlos?" o "¿cuánto he ahorrado?".
  it("consultarPersona y consultarMisEquipos están en los DOS modos: buscan por usuario, no por workspace activo", () => {
    const personal = createAssistantTools("u1", "w1", "MEMBER");
    const equipo = createAssistantTools("u1", "w1", "MEMBER", TEAM_MEMBERS);
    for (const nombre of ["consultarPersona", "consultarMisEquipos"]) {
      expect(personal).toHaveProperty(nombre);
      expect(equipo).toHaveProperty(nombre);
    }
  });

  it("las de ahorro están en los DOS modos: reciben personalWorkspaceId para funcionar desde un equipo", () => {
    const personal = createAssistantTools("u1", "w1", "MEMBER");
    const equipo = createAssistantTools(
      "u1",
      "w1",
      "MEMBER",
      TEAM_MEMBERS,
      "w-personal",
    );
    for (const nombre of ["registrarAhorro", "consultarAhorros"]) {
      expect(personal).toHaveProperty(nombre);
      expect(equipo).toHaveProperty(nombre);
    }
  });

  it("las compartidas (crear/completar/aplazar/agenda/memoria) están en los dos modos", () => {
    const compartidas = [
      "crearNota",
      "crearEvento",
      "completarTarea",
      "aplazarTarea",
      "editarEvento",
      "borrarEvento",
      "consultarAgenda",
      "recordarPreferencia",
      "olvidarPreferencia",
    ];
    const personal = createAssistantTools("u1", "w1", "MEMBER");
    const equipo = createAssistantTools("u1", "w1", "MEMBER", TEAM_MEMBERS);
    for (const nombre of compartidas) {
      expect(personal).toHaveProperty(nombre);
      expect(equipo).toHaveProperty(nombre);
    }
  });
});

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
    messageFindMany.mockReset();
    messageFindMany.mockResolvedValue([]);
    messageUpdateMany.mockReset();
    messageUpdateMany.mockResolvedValue({ count: 1 });
    messageUpdate.mockReset();
    messageUpdate.mockResolvedValue({});
    cuentaAhorroFindMany.mockReset();
    cuentaAhorroFindMany.mockResolvedValue([]);
    cuentaAhorroCreate.mockReset();
    movimientoAhorroCreate.mockReset();
    movimientoAhorroCreate.mockResolvedValue({
      fecha: new Date("2026-08-04T10:00:00.000Z"),
    });
    eventoFindMany.mockReset();
    eventoFindMany.mockResolvedValue([]);
    eventoUpdateMany.mockReset();
    eventoUpdateMany.mockResolvedValue({ count: 1 });
    eventoDeleteMany.mockReset();
    eventoDeleteMany.mockResolvedValue({ count: 1 });
    getCuentasConSaldo.mockReset();
    getCuentasConSaldo.mockResolvedValue([]);
  });

  it("crearNota guarda el contenido con el mismo pipeline que la captura rápida, ligado al usuario de la sesión, e invalida Tablero/Categorías", async () => {
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.crearNota.execute!(
      { contenido: "Llamar al banco mañana" },
      { toolCallId: "call-1", messages: [], context: undefined },
    );

    expect(captureMessage).toHaveBeenCalledWith(
      "u1",
      "Llamar al banco mañana",
      "w1",
    );
    expect(result).toMatchObject({
      id: "m1",
      categoria: "recordatorio",
      label: "Recordatorios",
      resumen: "Llamar al banco",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/pendientes");
    expect(revalidatePath).toHaveBeenCalledWith("/notas");
  });

  it("crearNota con asignadoA resuelve el miembro real y actualiza la nota ya guardada con su assigneeId", async () => {
    const tools = createAssistantTools("u1", "w1", "MEMBER", TEAM_MEMBERS);

    const result = await tools.crearNota.execute!(
      { contenido: "Revisar la propuesta", asignadoA: "ana" },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(messageUpdate).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { assigneeId: "u-ana" },
    });
    expect(result).toMatchObject({ asignadoA: "ana@example.com" });
  });

  it("crearNota con asignadoA que no coincide con nadie del equipo: guarda la nota sin asignar y lo avisa", async () => {
    const tools = createAssistantTools("u1", "w1", "MEMBER", TEAM_MEMBERS);

    const result = await tools.crearNota.execute!(
      { contenido: "Revisar la propuesta", asignadoA: "nadie-conocido" },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(messageUpdate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      asignadoA: null,
      asignacionNoEncontrada: "nadie-conocido",
    });
  });

  it("crearNota: si el miembro se resuelve pero la escritura de assigneeId falla, NO informa la asignación como hecha", async () => {
    // Bug real encontrado en revisión de código: el catch solo registraba
    // el error, pero el resultado seguía usando `asignado.email` como si
    // la escritura hubiera funcionado — el Asistente decía "asignada a X"
    // aunque la nota se hubiera guardado sin asignar de verdad.
    messageUpdate.mockRejectedValueOnce(new Error("conexión perdida"));
    const tools = createAssistantTools("u1", "w1", "MEMBER", TEAM_MEMBERS);

    const result = await tools.crearNota.execute!(
      { contenido: "Revisar la propuesta", asignadoA: "ana" },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(messageUpdate).toHaveBeenCalled();
    expect(result).toMatchObject({ asignadoA: null });
  });

  it("ante un fallo al guardar, lanza un mensaje en español sin filtrar detalles internos", async () => {
    captureMessage.mockRejectedValue(
      new Error("ECONNREFUSED 10.0.0.1:5432 supabase pooler"),
    );
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    await expect(
      tools.crearNota.execute!(
        { contenido: "algo" },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No se ha podido guardar la nota/);

    // El detalle interno (host/puerto de la BD) no debe salir en el mensaje.
    await expect(
      tools.crearNota.execute!(
        { contenido: "algo" },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.not.toThrow(/ECONNREFUSED|supabase|5432/);
  });

  it("un fallo al invalidar la caché NO tumba un guardado correcto", async () => {
    revalidatePath.mockImplementation(() => {
      throw new Error("revalidatePath fuera de contexto de petición");
    });
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.crearNota.execute!(
      { contenido: "Llamar al banco" },
      { toolCallId: "c", messages: [], context: undefined },
    );
    // La nota se guardó: se devuelve la fuente igualmente.
    expect(result).toMatchObject({ id: "m1", label: "Recordatorios" });
  });

  it("crearEvento guarda la cita ligada al usuario de la sesión e invalida /calendario", async () => {
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.crearEvento.execute!(
      { titulo: "Cita con el médico", fechaInicio: "2026-08-12T10:00:00.000Z" },
      { toolCallId: "call-1", messages: [], context: undefined },
    );

    expect(eventoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          titulo: "Cita con el médico",
        }),
      }),
    );
    expect(result).toMatchObject({
      eventos: [{ id: "e1", titulo: "Cita con el médico" }],
    });
    expect(revalidatePath).toHaveBeenCalledWith("/calendario");
  });

  it("crearEvento con repetir crea toda la serie en una sola llamada a la tool", async () => {
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.crearEvento.execute!(
      {
        titulo: "Hacer transacción",
        fechaInicio: "2026-08-06T09:00:00+02:00",
        repetir: { frecuencia: "SEMANAL", veces: 5 },
      },
      { toolCallId: "call-1", messages: [], context: undefined },
    );

    expect(eventoCreate).toHaveBeenCalledTimes(5);
    expect((result as { eventos: unknown[] }).eventos).toHaveLength(5);
    const fechas = eventoCreate.mock.calls.map((c) =>
      c[0].data.fechaInicio.toISOString(),
    );
    expect(fechas).toEqual([
      "2026-08-06T07:00:00.000Z",
      "2026-08-13T07:00:00.000Z",
      "2026-08-20T07:00:00.000Z",
      "2026-08-27T07:00:00.000Z",
      "2026-09-03T07:00:00.000Z",
    ]);
  });

  it("crearEvento con asignadoA resuelve el miembro real y guarda assigneeId", async () => {
    const tools = createAssistantTools("u1", "w1", "MEMBER", TEAM_MEMBERS);

    const result = await tools.crearEvento.execute!(
      {
        titulo: "Revisar la caldera",
        fechaInicio: "2026-08-14T20:00:00+02:00",
        asignadoA: "benitoelrey",
      },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(eventoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assigneeId: "u-benito" }),
      }),
    );
    expect(result).toMatchObject({
      eventos: [{ asignadoA: "benitoelrey@example.com" }],
    });
  });

  it("crearEvento con asignadoA que no coincide con nadie del equipo: crea el evento sin asignar y lo avisa", async () => {
    const tools = createAssistantTools("u1", "w1", "MEMBER", TEAM_MEMBERS);

    const result = await tools.crearEvento.execute!(
      {
        titulo: "Revisar la caldera",
        fechaInicio: "2026-08-14T20:00:00+02:00",
        asignadoA: "alguien-que-no-existe",
      },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(eventoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assigneeId: null }),
      }),
    );
    expect(result).toMatchObject({
      asignacionNoEncontrada: "alguien-que-no-existe",
    });
  });

  it("crearEvento rechaza una fecha de inicio que no se puede interpretar", async () => {
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    await expect(
      tools.crearEvento.execute!(
        { titulo: "Algo", fechaInicio: "no-es-una-fecha" },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he entendido bien la fecha/);
    expect(eventoCreate).not.toHaveBeenCalled();
  });

  it("crearEvento: ante un fallo al guardar, lanza un mensaje en español sin detalles internos", async () => {
    eventoCreate.mockRejectedValue(
      new Error("ECONNREFUSED 10.0.0.1:5432 supabase pooler"),
    );
    const tools = createAssistantTools("u1", "w1", "MEMBER");

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
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.crearEvento.execute!(
      { titulo: "Cita con el médico", fechaInicio: "2026-08-12T10:00:00.000Z" },
      { toolCallId: "c", messages: [], context: undefined },
    );
    expect(result).toMatchObject({ eventos: [{ id: "e1" }] });
  });

  it("completarTarea encuentra la pendiente por similitud semántica (aunque no repita el texto exacto) y la marca hecha", async () => {
    findSimilarMessages.mockResolvedValue([
      fakePendiente({ id: "p1", resumen: "Llamar al fontanero" }),
    ]);
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.completarTarea.execute!(
      { descripcion: "ya he llamado al fontanero" },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(embedQuery).toHaveBeenCalledWith("ya he llamado al fontanero");
    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "p1", workspaceId: "w1" },
      data: {
        estado: "HECHO",
        hecho: true,
        enProgresoPorId: null,
        enProgresoDesde: null,
      },
    });
    expect(result).toMatchObject({ id: "p1", resumen: "Llamar al fontanero" });
  });

  it("completarTarea ignora candidatos semánticos que ya están hechos o no son accionables", async () => {
    findSimilarMessages.mockResolvedValue([
      fakePendiente({ id: "ya-hecha", estado: "HECHO" }),
      fakePendiente({ id: "no-accionable", categoria: "idea" }),
      fakePendiente({ id: "la-buena" }),
    ]);
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.completarTarea.execute!(
      { descripcion: "algo" },
      { toolCallId: "c", messages: [], context: undefined },
    );
    expect(result).toMatchObject({ id: "la-buena" });
  });

  it("completarTarea cae a búsqueda de texto si no hay embedder (embedQuery devuelve null)", async () => {
    embedQuery.mockResolvedValue(null);
    messageFindFirst.mockResolvedValue(fakePendiente({ id: "p2" }));
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.completarTarea.execute!(
      { descripcion: "fontanero" },
      { toolCallId: "c", messages: [], context: undefined },
    );
    expect(findSimilarMessages).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: "p2" });
  });

  it("completarTarea: si semántica y texto encuentran candidatos distintos, gana la semántica (misma calidad que antes, ahora en paralelo)", async () => {
    findSimilarMessages.mockResolvedValue([
      fakePendiente({ id: "por-semantica" }),
    ]);
    messageFindFirst.mockResolvedValue(fakePendiente({ id: "por-texto" }));
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.completarTarea.execute!(
      { descripcion: "algo" },
      { toolCallId: "c", messages: [], context: undefined },
    );
    expect(result).toMatchObject({ id: "por-semantica" });
  });

  it("completarTarea lanza (en español) si no encuentra ninguna coincidencia", async () => {
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    await expect(
      tools.completarTarea.execute!(
        { descripcion: "algo que no existe" },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he encontrado ninguna tarea pendiente/);
    expect(messageUpdateMany).not.toHaveBeenCalled();
  });

  it("completarTarea: un fallo al invalidar la caché NO tumba una tarea ya marcada como hecha", async () => {
    findSimilarMessages.mockResolvedValue([fakePendiente({ id: "p3" })]);
    revalidatePath.mockImplementation(() => {
      throw new Error("revalidatePath fuera de contexto de petición");
    });
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.completarTarea.execute!(
      { descripcion: "algo" },
      { toolCallId: "c", messages: [], context: undefined },
    );
    expect(messageUpdateMany).toHaveBeenCalled();
    expect(result).toMatchObject({ id: "p3" });
  });

  it("aplazarTarea encuentra la pendiente y le pone la nueva fecha límite", async () => {
    findSimilarMessages.mockResolvedValue([
      fakePendiente({ id: "p1", resumen: "Llamar al fontanero" }),
    ]);
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.aplazarTarea.execute!(
      { descripcion: "llamar al fontanero", fecha: "2026-08-15T00:00:00.000Z" },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "p1", workspaceId: "w1" },
      data: { fechaLimite: new Date("2026-08-15T00:00:00.000Z") },
    });
    expect(result).toMatchObject({
      id: "p1",
      fechaLimite: "2026-08-15T00:00:00.000Z",
    });
  });

  it("aplazarTarea sin `fecha` quita la fecha límite", async () => {
    findSimilarMessages.mockResolvedValue([fakePendiente({ id: "p1" })]);
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.aplazarTarea.execute!(
      { descripcion: "llamar al fontanero" },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "p1", workspaceId: "w1" },
      data: { fechaLimite: null },
    });
    expect(result).toMatchObject({ id: "p1", fechaLimite: null });
  });

  it("aplazarTarea lanza (en español) si la fecha no se entiende", async () => {
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    await expect(
      tools.aplazarTarea.execute!(
        { descripcion: "algo", fecha: "no-es-una-fecha" },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he entendido bien la fecha/);
    expect(messageUpdateMany).not.toHaveBeenCalled();
  });

  it("aplazarTarea lanza (en español) si no encuentra ninguna coincidencia", async () => {
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    await expect(
      tools.aplazarTarea.execute!(
        {
          descripcion: "algo que no existe",
          fecha: "2026-08-15T00:00:00.000Z",
        },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he encontrado ninguna tarea pendiente/);
    expect(messageUpdateMany).not.toHaveBeenCalled();
  });

  it("asignarTarea encuentra la pendiente y la asigna a un miembro real del equipo (corrección tras crearla, como pide el usuario)", async () => {
    findSimilarMessages.mockResolvedValue([
      fakePendiente({ id: "p1", resumen: "Revisar la caldera" }),
    ]);
    const tools = createAssistantTools("u1", "w1", "MEMBER", TEAM_MEMBERS);

    const result = await tools.asignarTarea.execute!(
      { descripcion: "revisar la caldera", asignadoA: "benitoelrey" },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "p1", workspaceId: "w1" },
      data: { assigneeId: "u-benito" },
    });
    expect(result).toMatchObject({
      id: "p1",
      asignadoA: "benitoelrey@example.com",
    });
  });

  it("asignarTarea con quitarAsignacion quita la asignación sin buscar a nadie", async () => {
    findSimilarMessages.mockResolvedValue([fakePendiente({ id: "p1" })]);
    const tools = createAssistantTools("u1", "w1", "MEMBER", TEAM_MEMBERS);

    const result = await tools.asignarTarea.execute!(
      { descripcion: "revisar la caldera", quitarAsignacion: true },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "p1", workspaceId: "w1" },
      data: { assigneeId: null },
    });
    expect(result).toMatchObject({ asignadoA: null });
  });

  it("asignarTarea lanza en español si no dice a quién asignarla ni pide quitar la asignación", async () => {
    const tools = createAssistantTools("u1", "w1", "MEMBER", TEAM_MEMBERS);

    await expect(
      tools.asignarTarea.execute!(
        { descripcion: "algo" },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No me has dicho a quién asignarla/);
    expect(findSimilarMessages).not.toHaveBeenCalled();
  });

  it("asignarTarea lanza en español si el nombre no coincide con nadie del equipo, sin buscar la tarea", async () => {
    const tools = createAssistantTools("u1", "w1", "MEMBER", TEAM_MEMBERS);

    await expect(
      tools.asignarTarea.execute!(
        { descripcion: "revisar la caldera", asignadoA: "nadie-conocido" },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he encontrado a nadie del equipo/);
    expect(findSimilarMessages).not.toHaveBeenCalled();
    expect(messageUpdateMany).not.toHaveBeenCalled();
  });

  it("asignarTarea lanza (en español) si no encuentra ninguna tarea pendiente que coincida", async () => {
    const tools = createAssistantTools("u1", "w1", "MEMBER", TEAM_MEMBERS);

    await expect(
      tools.asignarTarea.execute!(
        { descripcion: "algo que no existe", asignadoA: "benitoelrey" },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he encontrado ninguna tarea pendiente/);
    expect(messageUpdateMany).not.toHaveBeenCalled();
  });

  it("registrarAhorro guarda el movimiento en una cuenta existente que coincide por nombre", async () => {
    cuentaAhorroFindMany.mockResolvedValue([
      { id: "c1", nombre: "Fondo de emergencia", userId: "u1" },
    ]);
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.registrarAhorro.execute!(
      { cuenta: "fondo de emergencia", importe: 50 },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(cuentaAhorroCreate).not.toHaveBeenCalled();
    expect(movimientoAhorroCreate).toHaveBeenCalledWith({
      data: {
        cuentaId: "c1",
        centimos: 5000,
        concepto: null,
        fecha: expect.any(Date),
      },
    });
    expect(result).toMatchObject({
      movimientos: [
        {
          cuentaId: "c1",
          cuentaNombre: "Fondo de emergencia",
          centimos: 5000,
          cuentaCreada: false,
        },
      ],
    });
    expect(revalidatePath).toHaveBeenCalledWith("/ahorros");
  });

  it("registrarAhorro con repetir registra toda la serie en una sola llamada a la tool", async () => {
    cuentaAhorroFindMany.mockResolvedValue([
      { id: "c1", nombre: "PruebaTrade", userId: "u1" },
    ]);
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.registrarAhorro.execute!(
      {
        cuenta: "PruebaTrade",
        importe: 400,
        repetir: { frecuencia: "SEMANAL", veces: 5 },
      },
      { toolCallId: "call-1", messages: [], context: undefined },
    );

    expect(movimientoAhorroCreate).toHaveBeenCalledTimes(5);
    expect((result as { movimientos: unknown[] }).movimientos).toHaveLength(5);
  });

  it("registrarAhorro crea la cuenta sobre la marcha si no hay ninguna parecida", async () => {
    cuentaAhorroFindMany.mockResolvedValue([]);
    cuentaAhorroCreate.mockResolvedValue({
      id: "c2",
      nombre: "Viaje a Japón",
      userId: "u1",
    });
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.registrarAhorro.execute!(
      { cuenta: "Viaje a Japón", importe: 20, concepto: "paga extra" },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(cuentaAhorroCreate).toHaveBeenCalledWith({
      data: { userId: "u1", nombre: "Viaje a Japón" },
    });
    expect(movimientoAhorroCreate).toHaveBeenCalledWith({
      data: {
        cuentaId: "c2",
        centimos: 2000,
        concepto: "paga extra",
        fecha: expect.any(Date),
      },
    });
    expect(result).toMatchObject({
      movimientos: [
        {
          cuentaId: "c2",
          cuentaNombre: "Viaje a Japón",
          centimos: 2000,
          cuentaCreada: true,
        },
      ],
    });
  });

  it("registrarAhorro acepta un importe negativo como retirada", async () => {
    cuentaAhorroFindMany.mockResolvedValue([
      { id: "c1", nombre: "Viaje", userId: "u1" },
    ]);
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.registrarAhorro.execute!(
      { cuenta: "viaje", importe: -15 },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(movimientoAhorroCreate).toHaveBeenCalledWith({
      data: {
        cuentaId: "c1",
        centimos: -1500,
        concepto: null,
        fecha: expect.any(Date),
      },
    });
    expect(result).toMatchObject({ movimientos: [{ centimos: -1500 }] });
  });

  it("registrarAhorro rechaza un importe que redondea a cero", async () => {
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    await expect(
      tools.registrarAhorro.execute!(
        { cuenta: "viaje", importe: 0 },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he entendido el importe/);
    expect(cuentaAhorroFindMany).not.toHaveBeenCalled();
  });

  it("registrarAhorro: ante un fallo al buscar/crear la cuenta, lanza un mensaje en español sin detalles internos", async () => {
    cuentaAhorroFindMany.mockRejectedValue(
      new Error("ECONNREFUSED 10.0.0.1:5432 supabase pooler"),
    );
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    await expect(
      tools.registrarAhorro.execute!(
        { cuenta: "viaje", importe: 10 },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he podido buscar tus cuentas de ahorro/);
    expect(movimientoAhorroCreate).not.toHaveBeenCalled();
  });

  it("registrarAhorro: ante un fallo al guardar el movimiento, lanza un mensaje en español sin detalles internos", async () => {
    cuentaAhorroFindMany.mockResolvedValue([
      { id: "c1", nombre: "Viaje", userId: "u1" },
    ]);
    movimientoAhorroCreate.mockRejectedValue(
      new Error("ECONNREFUSED 10.0.0.1:5432 supabase pooler"),
    );
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    await expect(
      tools.registrarAhorro.execute!(
        { cuenta: "viaje", importe: 10 },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No se ha podido guardar el movimiento/);
  });

  it("registrarAhorro: un fallo al invalidar la caché NO tumba un movimiento ya guardado", async () => {
    cuentaAhorroFindMany.mockResolvedValue([
      { id: "c1", nombre: "Viaje", userId: "u1" },
    ]);
    revalidatePath.mockImplementation(() => {
      throw new Error("revalidatePath fuera de contexto de petición");
    });
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.registrarAhorro.execute!(
      { cuenta: "viaje", importe: 10 },
      { toolCallId: "c", messages: [], context: undefined },
    );
    expect(movimientoAhorroCreate).toHaveBeenCalled();
    expect(result).toMatchObject({ movimientos: [{ cuentaId: "c1" }] });
  });

  it("editarEvento busca solo entre eventos futuros (hoy incluido) y cambia los campos dados", async () => {
    eventoFindMany.mockResolvedValue([fakeEvento]);
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.editarEvento.execute!(
      {
        descripcion: "cita con el médico",
        fechaInicioNueva: "2026-08-13T17:00:00.000Z",
      },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(eventoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "w1" }),
      }),
    );
    expect(eventoUpdateMany).toHaveBeenCalledWith({
      where: { id: "e1", workspaceId: "w1" },
      data: { fechaInicio: new Date("2026-08-13T17:00:00.000Z") },
    });
    expect(result).toMatchObject({
      id: "e1",
      fechaInicio: "2026-08-13T17:00:00.000Z",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/calendario");
  });

  it("editarEvento encuentra el evento aunque las tildes no coincidan (guardado con tilde, descripción sin ella o al revés)", async () => {
    eventoFindMany.mockResolvedValue([
      { ...fakeEvento, titulo: "Reunión de seguimiento" },
    ]);
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.editarEvento.execute!(
      {
        descripcion: "la reunion de seguimiento",
        tituloNuevo: "Reunión de seguimiento (aplazada)",
      },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(eventoUpdateMany).toHaveBeenCalled();
    expect(result).toMatchObject({ id: "e1" });
  });

  it("editarEvento lanza si no encuentra ningún evento que coincida", async () => {
    eventoFindMany.mockResolvedValue([]);
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    await expect(
      tools.editarEvento.execute!(
        { descripcion: "algo que no existe", tituloNuevo: "X" },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he encontrado ningún evento/);
    expect(eventoUpdateMany).not.toHaveBeenCalled();
  });

  it("editarEvento lanza si no se le da ningún campo que cambiar", async () => {
    eventoFindMany.mockResolvedValue([fakeEvento]);
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    await expect(
      tools.editarEvento.execute!(
        { descripcion: "cita con el médico" },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/qué cambiar/);
    expect(eventoUpdateMany).not.toHaveBeenCalled();
  });

  it("editarEvento con asignadoA asigna un evento ya creado a un miembro real del equipo (corrección tras crearlo)", async () => {
    eventoFindMany.mockResolvedValue([fakeEvento]);
    const tools = createAssistantTools("u1", "w1", "MEMBER", TEAM_MEMBERS);

    const result = await tools.editarEvento.execute!(
      { descripcion: "cita con el médico", asignadoA: "benitoelrey" },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(eventoUpdateMany).toHaveBeenCalledWith({
      where: { id: "e1", workspaceId: "w1" },
      data: { assigneeId: "u-benito" },
    });
    expect(result).toMatchObject({ asignadoA: "benitoelrey@example.com" });
  });

  it("editarEvento con quitarAsignacion quita la asignación sin poner a otra persona", async () => {
    eventoFindMany.mockResolvedValue([fakeEvento]);
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.editarEvento.execute!(
      { descripcion: "cita con el médico", quitarAsignacion: true },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(eventoUpdateMany).toHaveBeenCalledWith({
      where: { id: "e1", workspaceId: "w1" },
      data: { assigneeId: null },
    });
    expect(result).toMatchObject({ asignadoA: null });
  });

  it("editarEvento: si llegan asignadoA Y quitarAsignacion a la vez, quitarAsignacion gana en la escritura Y en lo que se informa", async () => {
    // Bug real encontrado en revisión de código: la escritura ya hacía
    // ganar a quitarAsignacion (assigneeId: null), pero el resultado
    // seguía reportando `asignadoA: asignado.email` — el Asistente podía
    // decir "asignada a X" con el evento en realidad guardado sin asignar.
    eventoFindMany.mockResolvedValue([fakeEvento]);
    const tools = createAssistantTools("u1", "w1", "MEMBER", TEAM_MEMBERS);

    const result = await tools.editarEvento.execute!(
      {
        descripcion: "cita con el médico",
        asignadoA: "benitoelrey",
        quitarAsignacion: true,
      },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(eventoUpdateMany).toHaveBeenCalledWith({
      where: { id: "e1", workspaceId: "w1" },
      data: { assigneeId: null },
    });
    expect(result).toMatchObject({ asignadoA: null });
  });

  it("editarEvento con asignadoA que no coincide con nadie del equipo lanza en español, sin tocar el evento", async () => {
    eventoFindMany.mockResolvedValue([fakeEvento]);
    const tools = createAssistantTools("u1", "w1", "MEMBER", TEAM_MEMBERS);

    await expect(
      tools.editarEvento.execute!(
        {
          descripcion: "cita con el médico",
          asignadoA: "alguien-que-no-existe",
        },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he encontrado a nadie del equipo/);
    expect(eventoUpdateMany).not.toHaveBeenCalled();
  });

  it("editarEvento rechaza una fecha nueva que no se puede interpretar", async () => {
    eventoFindMany.mockResolvedValue([fakeEvento]);
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    await expect(
      tools.editarEvento.execute!(
        {
          descripcion: "cita con el médico",
          fechaInicioNueva: "no-es-una-fecha",
        },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he entendido bien la nueva fecha/);
    expect(eventoUpdateMany).not.toHaveBeenCalled();
  });

  it("borrarEvento encuentra y borra el evento que coincide", async () => {
    eventoFindMany.mockResolvedValue([fakeEvento]);
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.borrarEvento.execute!(
      { descripcion: "médico" },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(eventoDeleteMany).toHaveBeenCalledWith({
      where: { id: "e1", workspaceId: "w1" },
    });
    expect(result).toMatchObject({ id: "e1", titulo: "Cita con el médico" });
    expect(revalidatePath).toHaveBeenCalledWith("/calendario");
  });

  it("borrarEvento lanza si no encuentra ningún evento que coincida", async () => {
    eventoFindMany.mockResolvedValue([]);
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    await expect(
      tools.borrarEvento.execute!(
        { descripcion: "algo que no existe" },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he encontrado ningún evento/);
    expect(eventoDeleteMany).not.toHaveBeenCalled();
  });

  it("borrarEvento: ante un fallo al borrar, lanza un mensaje en español sin detalles internos", async () => {
    eventoFindMany.mockResolvedValue([fakeEvento]);
    eventoDeleteMany.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1:5432"));
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    await expect(
      tools.borrarEvento.execute!(
        { descripcion: "médico" },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No se ha podido borrar el evento/);
  });

  it("consultarAhorros sin nombre de cuenta devuelve todas con el total", async () => {
    getCuentasConSaldo.mockResolvedValue([
      {
        id: "c1",
        nombre: "Viaje",
        saldoCentimos: 5000,
        objetivoCentimos: null,
        createdAt: new Date(),
        userId: "u1",
      },
      {
        id: "c2",
        nombre: "Fondo de emergencia",
        saldoCentimos: 12000,
        objetivoCentimos: null,
        createdAt: new Date(),
        userId: "u1",
      },
    ]);
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.consultarAhorros.execute!(
      {},
      { toolCallId: "c", messages: [], context: undefined },
    );

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
      {
        id: "c1",
        nombre: "Fondo de emergencia",
        saldoCentimos: 12000,
        objetivoCentimos: null,
        createdAt: new Date(),
        userId: "u1",
      },
    ]);
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    const result = await tools.consultarAhorros.execute!(
      { cuenta: "emergencia" },
      { toolCallId: "c", messages: [], context: undefined },
    );

    expect(result).toEqual({
      cuentas: [{ nombre: "Fondo de emergencia", saldoCentimos: 12000 }],
      totalCentimos: 12000,
    });
  });

  it("consultarAhorros lanza si pregunta por una cuenta que no existe", async () => {
    getCuentasConSaldo.mockResolvedValue([]);
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    await expect(
      tools.consultarAhorros.execute!(
        { cuenta: "inventada" },
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No encuentro ninguna cuenta/);
  });

  it("consultarAhorros: ante un fallo al leer, lanza un mensaje en español sin detalles internos", async () => {
    getCuentasConSaldo.mockRejectedValue(
      new Error("ECONNREFUSED 10.0.0.1:5432"),
    );
    const tools = createAssistantTools("u1", "w1", "MEMBER");

    await expect(
      tools.consultarAhorros.execute!(
        {},
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he podido consultar tus ahorros/);
  });

  it("analizarEquipo agrega pendientes/en progreso/vencidas/completadas por persona y el total del equipo", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T12:00:00.000Z"));
    messageFindMany
      .mockResolvedValueOnce([
        // Abiertas (POR_HACER/EN_PROGRESO)
        {
          assigneeId: "u-benito",
          estado: "POR_HACER",
          fechaLimite: new Date("2026-08-10T00:00:00.000Z"),
          categoria: "tarea",
          enProgresoPorId: null,
        }, // vencida
        {
          assigneeId: "u-benito",
          estado: "EN_PROGRESO",
          fechaLimite: null,
          categoria: "tarea",
          enProgresoPorId: "u-benito",
        },
        {
          assigneeId: "u-ana",
          estado: "POR_HACER",
          fechaLimite: new Date("2026-08-20T00:00:00.000Z"),
          categoria: "idea",
          enProgresoPorId: null,
        },
        {
          assigneeId: null,
          estado: "POR_HACER",
          fechaLimite: null,
          categoria: "tarea",
          enProgresoPorId: null,
        },
      ])
      .mockResolvedValueOnce([
        // Completadas última semana
        { assigneeId: "u-ana" },
        { assigneeId: "u-ana" },
      ]);
    const tools = createAssistantTools("u1", "w1", "MEMBER", TEAM_MEMBERS);

    const result = await tools.analizarEquipo.execute!(
      {},
      { toolCallId: "c", messages: [], context: undefined },
    );
    vi.useRealTimers();

    expect(result).toEqual({
      porMiembro: [
        {
          email: "benitoelrey@example.com",
          pendientes: 1,
          enProgreso: 1,
          vencidas: 1,
          completadasUltimaSemana: 0,
          trabajandoAhora: true,
        },
        {
          email: "ana@example.com",
          pendientes: 1,
          enProgreso: 0,
          vencidas: 0,
          completadasUltimaSemana: 2,
          trabajandoAhora: false,
        },
      ],
      totalPendientesYEnProgreso: 4,
      totalVencidas: 1,
      categoriaMasFrecuente: "tarea",
    });
  });

  it("en el workspace personal, ni se ofrece analizarEquipo al modelo (no solo falla al usarla)", () => {
    // Antes esto se defendía DENTRO de la tool ("if members.length === 0
    // throw"): el modelo la veía igual y solo se enteraba de que no podía
    // usarla al intentarlo. Ahora directamente no está en el juego de
    // herramientas de este modo (ver el filtrado al final de
    // createAssistantTools) — el guard interno se queda como red de
    // seguridad, pero por este camino ya es inalcanzable.
    const tools = createAssistantTools("u1", "w1", "MEMBER");
    expect(tools.analizarEquipo).toBeUndefined();
  });

  it("analizarEquipo: ante un fallo al leer, lanza un mensaje en español sin detalles internos", async () => {
    messageFindMany.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1:5432"));
    const tools = createAssistantTools("u1", "w1", "MEMBER", TEAM_MEMBERS);

    await expect(
      tools.analizarEquipo.execute!(
        {},
        { toolCallId: "c", messages: [], context: undefined },
      ),
    ).rejects.toThrow(/No he podido analizar el equipo/);
  });

  describe("rol VIEWER (solo lectura)", () => {
    it("crearNota rechaza con rol VIEWER, sin llegar a guardar nada", async () => {
      const tools = createAssistantTools("u1", "w1", "VIEWER");
      await expect(
        tools.crearNota.execute!(
          { contenido: "algo" },
          { toolCallId: "c", messages: [], context: undefined },
        ),
      ).rejects.toThrow(/solo lectura/);
      expect(captureMessage).not.toHaveBeenCalled();
    });

    it("crearEvento rechaza con rol VIEWER", async () => {
      const tools = createAssistantTools("u1", "w1", "VIEWER");
      await expect(
        tools.crearEvento.execute!(
          { titulo: "Cita", fechaInicio: "2026-08-12T10:00:00.000Z" },
          { toolCallId: "c", messages: [], context: undefined },
        ),
      ).rejects.toThrow(/solo lectura/);
      expect(eventoCreate).not.toHaveBeenCalled();
    });

    it("completarTarea rechaza con rol VIEWER", async () => {
      const tools = createAssistantTools("u1", "w1", "VIEWER");
      await expect(
        tools.completarTarea.execute!(
          { descripcion: "algo" },
          { toolCallId: "c", messages: [], context: undefined },
        ),
      ).rejects.toThrow(/solo lectura/);
      expect(messageUpdateMany).not.toHaveBeenCalled();
    });

    it("aplazarTarea rechaza con rol VIEWER", async () => {
      const tools = createAssistantTools("u1", "w1", "VIEWER");
      await expect(
        tools.aplazarTarea.execute!(
          { descripcion: "algo", fecha: "2026-08-15T00:00:00.000Z" },
          { toolCallId: "c", messages: [], context: undefined },
        ),
      ).rejects.toThrow(/solo lectura/);
      expect(messageUpdateMany).not.toHaveBeenCalled();
    });

    it("asignarTarea rechaza con rol VIEWER", async () => {
      // Con miembros de equipo: asignarTarea es una tool solo-de-equipo (ver
      // el filtrado en createAssistantTools) — sin esto, en personal ni
      // existiría en `tools` y el test fallaría por eso, no por el rol.
      const tools = createAssistantTools("u1", "w1", "VIEWER", TEAM_MEMBERS);
      await expect(
        tools.asignarTarea.execute!(
          { descripcion: "algo", asignadoA: "benitoelrey" },
          { toolCallId: "c", messages: [], context: undefined },
        ),
      ).rejects.toThrow(/solo lectura/);
      expect(messageUpdateMany).not.toHaveBeenCalled();
    });

    it("editarEvento rechaza con rol VIEWER", async () => {
      const tools = createAssistantTools("u1", "w1", "VIEWER");
      await expect(
        tools.editarEvento.execute!(
          { descripcion: "cita", fechaInicioNueva: "2026-08-13T17:00:00.000Z" },
          { toolCallId: "c", messages: [], context: undefined },
        ),
      ).rejects.toThrow(/solo lectura/);
      expect(eventoUpdateMany).not.toHaveBeenCalled();
    });

    it("borrarEvento rechaza con rol VIEWER", async () => {
      const tools = createAssistantTools("u1", "w1", "VIEWER");
      await expect(
        tools.borrarEvento.execute!(
          { descripcion: "médico" },
          { toolCallId: "c", messages: [], context: undefined },
        ),
      ).rejects.toThrow(/solo lectura/);
    });

    it("registrarAhorro NO se bloquea con rol VIEWER (Ahorros es siempre personal)", async () => {
      cuentaAhorroFindMany.mockResolvedValue([
        { id: "c1", nombre: "Fondo de emergencia", userId: "u1" },
      ]);
      const tools = createAssistantTools("u1", "w1", "VIEWER");
      const result = await tools.registrarAhorro.execute!(
        { cuenta: "fondo de emergencia", importe: 50 },
        { toolCallId: "c", messages: [], context: undefined },
      );
      expect(result).toMatchObject({
        movimientos: [{ cuentaId: "c1", centimos: 5000 }],
      });
    });

    it("consultarAhorros NO se bloquea con rol VIEWER (Ahorros es siempre personal)", async () => {
      getCuentasConSaldo.mockResolvedValue([
        { nombre: "Fondo de emergencia", saldoCentimos: 12000 },
      ]);
      const tools = createAssistantTools("u1", "w1", "VIEWER");
      const result = await tools.consultarAhorros.execute!(
        {},
        { toolCallId: "c", messages: [], context: undefined },
      );
      expect(result).toMatchObject({ totalCentimos: 12000 });
    });
  });
});
