import "server-only";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { Message, CuentaAhorro, Evento } from "@prisma/client";
import { captureMessage, resolveEmbedder } from "./pipeline";
import { toAssistantSource, type AssistantSource, type AssistantWorkspaceMemberInfo } from "./assistantContext";
import { ACTIONABLE_CATEGORIES } from "./categories";
import { findSimilarMessages } from "./vectorSearch";
import { getCuentasConSaldo } from "./ahorros";
import { FRECUENCIAS, fechaRepeticion } from "./calendar";
import { canWrite, READONLY_ROLE_MESSAGE, listWorkspaceMembers, isOnline } from "./workspace";
import { postChatMessage, ensureDefaultGroupConversation } from "@/app/(dashboard)/chat/actions";
import { saveAssistantMemory, forgetAssistantMemory } from "./assistantMemory";
import { normalizeForMatch, matchPersonaPorEmail } from "./textMatch";
import { resolvePersona, resolveAgenda, resolveMisEquipos } from "./assistantTeamContext";
import { prisma } from "./prisma";
import type { WorkspaceRole } from "@prisma/client";

// Distancia coseno máxima para que una coincidencia semántica cuente como
// "la tarea de la que habla el usuario" — más estricto que el umbral de las
// fuentes citadas (ver SOURCE_MAX_DISTANCE en api/asistente/route.ts): esta
// función alimenta completarTarea/aplazarTarea/asignarTarea, que ACTÚAN
// sobre la tarea encontrada — una coincidencia floja aquí completa/aplaza/
// asigna la tarea equivocada, no solo cita una nota de más.
const TASK_MATCH_MAX_DISTANCE = 0.4;

/**
 * Resuelve un nombre o email libre contra un miembro real del equipo
 * ACTIVO. Sin esto, "asígnaselo a X" solo podía guardarse como texto suelto
 * (`participantes` en `Evento`), sin enlazar de verdad con la cuenta de esa
 * persona — a quien nunca le aparecería la tarjeta como asignada.
 *
 * La lógica de coincidencia vive en `matchPersonaPorEmail` (textMatch.ts),
 * compartida con las consultas que buscan a una persona en CUALQUIERA de
 * los equipos del usuario (ver assistantTeamContext.ts) — un único criterio
 * de "cómo se llama esta persona" para todo el Asistente.
 *
 * `members` llega ya resuelto desde route.ts (ver `AssistantWorkspaceMemberInfo`)
 * — antes cada tool volvía a consultar `membership.findMany` por su cuenta,
 * una ida y vuelta redundante a la BD en peticiones que, al encadenar varias
 * llamadas a herramienta, ya son las más lentas (verificado en vivo: sumaba
 * presión real al pool de conexiones de Postgres).
 */
export function resolverMiembro(nombre: string, members: AssistantWorkspaceMemberInfo[]): AssistantWorkspaceMemberInfo | null {
  return matchPersonaPorEmail(nombre, members);
}

export interface CrearEventoResult {
  id: string;
  titulo: string;
  fechaInicio: string;
  ubicacion: string | null;
  /** Email de a quién se ha asignado, si se pidió y se encontró en el equipo. */
  asignadoA: string | null;
}

export interface CrearEventoToolResult {
  eventos: CrearEventoResult[];
  /** El usuario pidió asignarlo a alguien, pero no hay nadie en el equipo con ese nombre/email. */
  asignacionNoEncontrada?: string;
}

export interface CompletarTareaResult {
  id: string;
  resumen: string;
  categoria: string;
}

export interface AplazarTareaResult {
  id: string;
  resumen: string;
  categoria: string;
  fechaLimite: string | null;
}

export interface AsignarTareaResult {
  id: string;
  resumen: string;
  categoria: string;
  asignadoA: string | null;
}

export interface RegistrarAhorroResult {
  cuentaId: string;
  cuentaNombre: string;
  centimos: number;
  fecha: string;
  /** Si no existía ninguna cuenta parecida y se creó una nueva sobre la marcha. */
  cuentaCreada: boolean;
}

export interface RegistrarAhorroToolResult {
  movimientos: RegistrarAhorroResult[];
}

export interface EditarEventoResult {
  id: string;
  titulo: string;
  fechaInicio: string;
  ubicacion: string | null;
  asignadoA: string | null;
  asignacionNoEncontrada?: string;
}

export interface BorrarEventoResult {
  id: string;
  titulo: string;
}

export interface ConsultarAhorrosResult {
  cuentas: { nombre: string; saldoCentimos: number }[];
  totalCentimos: number;
}

/**
 * Parámetro opcional compartido por `crearEvento` y `registrarAhorro` para
 * peticiones repetidas/periódicas ("todos los jueves durante 5 semanas").
 * Antes, esto se dejaba en manos del modelo: llamar a la tool N veces
 * seguidas en el mismo turno. En la práctica, con N grande (5-10 llamadas)
 * el modelo se quedaba a medias o incluso colgaba la respuesta entera
 * (verificado en vivo) — cada llamada a herramienta es un turno completo de
 * ida y vuelta a Groq, y encadenar muchos es lento y frágil. Con esto, UNA
 * sola llamada crea toda la serie de una vez, en el propio servidor.
 */
const RepetirSchema = z.object({
  frecuencia: z.enum(FRECUENCIAS).describe("Cada cuánto se repite: diaria, semanal, quincenal o mensual."),
  veces: z
    .number()
    .int()
    .min(2)
    .max(20)
    .describe("Número total de repeticiones, incluyendo la primera (p. ej. 5 para \"durante 5 semanas\")."),
});

function isPendienteAccionable(m: Message): boolean {
  return (ACTIONABLE_CATEGORIES as readonly string[]).includes(m.categoria) && m.estado !== "HECHO";
}

/**
 * Busca, entre las tareas/recordatorios pendientes del workspace activo,
 * la que mejor coincide con una descripción libre. Prefiere el resultado
 * semántico (misma infraestructura que las fuentes citadas del propio
 * Asistente) porque el usuario rara vez repite el texto exacto de la nota
 * original ("ya he llamado al fontanero" vs. "Llamar al fontanero para
 * revisar la caldera") — un ILIKE de texto exacto fallaría casi siempre.
 *
 * Las dos búsquedas van EN PARALELO, no una tras otra: si fueran en serie
 * (semántica, y solo si falla, texto), el caso común en el que la
 * semántica no encuentra nada acabaría esperando las dos búsquedas de
 * todos modos, pero una detrás de la otra — el doble de lento que
 * lanzarlas a la vez y quedarse con la semántica si la hay.
 */
async function encontrarTareaPendiente(workspaceId: string, descripcion: string): Promise<Message | null> {
  const semantica = (async (): Promise<Message | null> => {
    try {
      const embedding = await resolveEmbedder().embedQuery(descripcion);
      if (!embedding) return null;
      const similares = await findSimilarMessages(workspaceId, embedding, {
        limit: 8,
        maxDistance: TASK_MATCH_MAX_DISTANCE,
      });
      return similares.find(isPendienteAccionable) ?? null;
    } catch (err) {
      console.error("No se pudo buscar la tarea semánticamente (se usa el resultado por texto):", err);
      return null;
    }
  })();

  const porTexto = prisma.message.findFirst({
    where: {
      workspaceId,
      categoria: { in: [...ACTIONABLE_CATEGORIES] },
      estado: { not: "HECHO" },
      OR: [
        { contenido: { contains: descripcion, mode: "insensitive" } },
        { resumen: { contains: descripcion, mode: "insensitive" } },
      ],
    },
    orderBy: { fecha: "desc" },
  });

  const [matchSemantico, matchPorTexto] = await Promise.all([semantica, porTexto]);
  return matchSemantico ?? matchPorTexto;
}

/**
 * Busca, entre las cuentas de ahorro del usuario, una cuyo nombre encaje
 * con lo que menciona ("el fondo de emergencia" → "Fondo de emergencia").
 * A diferencia de `encontrarTareaPendiente`, sin búsqueda semántica: los
 * nombres de cuenta son etiquetas cortas puestas por el propio usuario, no
 * texto libre largo — un simple contains en cualquiera de los dos sentidos
 * ya cubre bien el caso real ("emergencia" ⊂ "Fondo de emergencia" y
 * viceversa), y no hace falta generar un embedding para eso. Si no
 * encuentra ninguna parecida, CREA la cuenta con ese nombre — "busca o
 * crea", como pidió el usuario.
 */
async function encontrarOCrearCuenta(
  userId: string,
  nombreBuscado: string,
): Promise<{ cuenta: CuentaAhorro; creada: boolean }> {
  const normalizado = normalizeForMatch(nombreBuscado);
  const cuentas = await prisma.cuentaAhorro.findMany({ where: { userId } });
  const match = cuentas.find((c) => {
    const n = normalizeForMatch(c.nombre);
    return n.includes(normalizado) || normalizado.includes(n);
  });
  if (match) return { cuenta: match, creada: false };

  const creada = await prisma.cuentaAhorro.create({ data: { userId, nombre: nombreBuscado.trim() } });
  return { cuenta: creada, creada: true };
}

/**
 * Busca, entre los eventos FUTUROS del workspace activo (hoy incluido), el
 * que mejor coincide con una descripción libre ("la cita del médico", "la
 * reunión del jueves"). Solo futuros a propósito: editar/borrar un evento
 * ya pasado no es una acción real que alguien pida por voz — y así, si hay
 * dos eventos con nombre parecido, uno pasado y uno próximo, siempre gana
 * el que de verdad tiene sentido tocar. Mismo criterio de coincidencia por
 * texto bidireccional que `encontrarOCrearCuenta` (títulos de evento son
 * etiquetas cortas, no hace falta búsqueda semántica).
 */
async function encontrarEvento(workspaceId: string, descripcion: string): Promise<Evento | null> {
  const normalizado = normalizeForMatch(descripcion);
  const eventos = await prisma.evento.findMany({
    where: { workspaceId, fechaInicio: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    orderBy: { fechaInicio: "asc" },
  });
  return (
    eventos.find((e) => {
      const t = normalizeForMatch(e.titulo);
      return t.includes(normalizado) || normalizado.includes(t);
    }) ?? null
  );
}

/**
 * Herramientas que dejan al Asistente actuar de verdad (no solo responder).
 * Fábrica (no un objeto estático) porque cada tool necesita saber para qué
 * usuario está guardando — se liga al userId de la sesión ya verificada en
 * la ruta, nunca al de un mensaje o input del propio modelo. `workspaceId`
 * (Fase Equipo) es el workspace ACTIVO en el momento de la petición —
 * `crearNota`/`crearEvento`/`completarTarea`/`editarEvento`/`borrarEvento`
 * lo usan como límite de acceso; `registrarAhorro`/`consultarAhorros` lo
 * ignoran a propósito (Ahorros es siempre personal, ver `getPersonalWorkspaceId`
 * en `lib/workspace.ts` — el llamante les pasa el userId tal cual, nunca
 * el workspace).
 *
 * Definidas aparte de api/asistente/route.ts para poder importar SOLO su
 * tipo (`InferUITools`) desde el cliente sin arrastrar código de servidor
 * al bundle — un `import type` se borra en compilación, así que no rompe
 * el límite server-only pese a venir del mismo módulo.
 *
 * `members`: el roster del workspace activo, ya resuelto en route.ts (la
 * misma consulta que alimenta la línea de contexto del sistema) — las
 * tools que admiten `asignadoA` lo reciben tal cual en vez de volver a
 * consultarlo cada una por su cuenta. Vacío en modo personal.
 */
export function createAssistantTools(
  userId: string,
  workspaceId: string,
  role: WorkspaceRole,
  members: AssistantWorkspaceMemberInfo[] = [],
  /**
   * El espacio personal del usuario, para las consultas que NO deben
   * limitarse al workspace activo: `consultarAgenda` mezcla lo de todos sus
   * equipos con lo suyo propio, porque al preguntar "¿qué tengo esta
   * semana?" nadie está pensando en qué pestaña tiene abierta. Por defecto
   * el activo, que es lo correcto cuando el activo YA es el personal.
   */
  personalWorkspaceId: string = workspaceId,
) {
  // Solo bloquea las 5 tools que escriben notas/eventos del workspace
  // activo — registrarAhorro/consultarAhorros ignoran el rol a propósito
  // (Ahorros es siempre personal, ver el comentario de arriba).
  function requireWrite(): void {
    if (!canWrite(role)) throw new Error(READONLY_ROLE_MESSAGE);
  }
  const todas = {
    crearNota: tool({
      description:
        "Crea y guarda una nota, tarea o recordatorio nuevo SIN fecha/hora concreta, categorizándolo automáticamente (igual que la captura rápida del dashboard). Llámala directamente en el mismo turno cuando el usuario pida crear, apuntar, anotar o recordar algo — no preguntes primero si quiere que lo hagas. NO la uses si lo que pide tiene fecha/hora concreta (una cita, quedar con alguien) o se repite periódicamente ('todos los jueves', 'cada semana') — para eso usa crearEvento (con su parámetro repetir si se repite), aunque suene a 'tarea'. Si pide ASIGNARLA a un compañero de equipo (\"apunta a María que revise esto\", \"que sea de Pedro\"), usa `asignadoA`.",
      inputSchema: z.object({
        contenido: z
          .string()
          .min(1)
          .describe("El texto de la nota/tarea/recordatorio tal como lo diría el usuario, listo para guardar y categorizar."),
        asignadoA: z
          .string()
          .optional()
          .describe("Nombre o email de la persona del EQUIPO a la que se asigna, solo en un workspace de equipo."),
      }),
      execute: async ({ contenido, asignadoA }) => {
        requireWrite();
        let saved;
        try {
          saved = await captureMessage(userId, contenido, workspaceId);
        } catch (err) {
          console.error("La tool crearNota no pudo guardar la nota:", err);
          Sentry.captureException(err);
          // Mensaje ya en español y sin detalles internos: el AI SDK lo
          // expone como `errorText` del part, que la UI muestra tal cual
          // (ver CrearNotaResult en AssistantChat.tsx).
          throw new Error("No se ha podido guardar la nota. Inténtalo de nuevo en un momento.");
        }

        const asignado = asignadoA ? resolverMiembro(asignadoA, members) : null;
        // Si la asignación en sí falla, `asignado` se limpia a `null` antes
        // de construir el resultado — sin esto, el Asistente podía decir
        // "asignada a X" aunque la escritura hubiera fallado de verdad.
        let asignacionGuardada = asignado;
        if (asignado) {
          try {
            await prisma.message.update({ where: { id: saved.id }, data: { assigneeId: asignado.userId } });
          } catch (err) {
            console.error("La tool crearNota no pudo asignarla (se guarda sin asignar):", err);
            asignacionGuardada = null;
          }
        }

        // Invalidar la caché no es crítico: si falla, la nota YA está guardada
        // — no convertir un guardado correcto en un error de cara al usuario.
        // (Sin esto, navegar a Tablero/Categorías tras crearla podría enseñar
        // la versión cacheada de antes; el chat vive en otra pestaña.)
        try {
          revalidatePath("/pendientes");
          revalidatePath("/categorias");
        } catch (err) {
          console.error("No se pudo invalidar la caché tras crear la nota (no crítico):", err);
        }

        const result: AssistantSource & { asignadoA: string | null; asignacionNoEncontrada?: string } = {
          ...toAssistantSource(saved),
          asignadoA: asignacionGuardada?.email ?? null,
          asignacionNoEncontrada: asignadoA && !asignado ? asignadoA : undefined,
        };
        return result;
      },
    }),
    crearEvento: tool({
      description:
        "Crea una cita o evento con fecha y hora concreta en el calendario del usuario. Llámala cuando describa algo con fecha/hora clara (\"quedar el jueves a las 5\", \"cita con el médico el 12 a las 10\"). Si falta la hora o la fecha es ambigua, pregunta antes de llamarla — nunca inventes una hora que no te han dado. Si es algo que se repite en el tiempo (\"todos los jueves durante 5 semanas\", \"cada día esta semana\"), usa el parámetro `repetir` en ESTA MISMA llamada para crear toda la serie de una vez — no llames a la tool varias veces seguidas para eso. Si pide ASIGNARLO a un compañero de equipo (\"asígnaselo a María\", \"que sea de Pedro\"), usa `asignadoA` — NO `participantes` (eso es solo para gente mencionada sin más, no una asignación real).",
      inputSchema: z.object({
        titulo: z.string().min(1).describe("Título corto del evento."),
        fechaInicio: z
          .string()
          .describe("Fecha y hora de inicio de la PRIMERA ocurrencia, en formato ISO 8601 (con zona horaria si se conoce)."),
        fechaFin: z.string().optional().describe("Fecha y hora de fin de la primera ocurrencia, solo si el usuario la menciona."),
        descripcion: z.string().optional(),
        ubicacion: z.string().optional(),
        participantes: z
          .array(z.string())
          .optional()
          .describe("Nombres de las personas mencionadas, si las hay, SIN que sea una asignación real (ver `asignadoA`)."),
        asignadoA: z
          .string()
          .optional()
          .describe("Nombre o email de la persona del EQUIPO a la que se asigna el evento, solo en un workspace de equipo (\"asígnaselo a X\", \"que sea de X\")."),
        repetir: RepetirSchema.optional().describe(
          "Solo si el evento se repite periódicamente. Crea `veces` eventos en total, uno por cada `frecuencia` a partir de fechaInicio/fechaFin.",
        ),
      }),
      execute: async ({ titulo, fechaInicio, fechaFin, descripcion, ubicacion, participantes, asignadoA, repetir }) => {
        requireWrite();
        const fecha = new Date(fechaInicio);
        if (Number.isNaN(fecha.getTime())) {
          throw new Error("No he entendido bien la fecha. ¿Puedes decírmela de otra forma (día y hora)?");
        }
        const fin = fechaFin ? new Date(fechaFin) : null;
        if (fin && Number.isNaN(fin.getTime())) {
          throw new Error("No he entendido bien la fecha de fin.");
        }

        // Se resuelve UNA vez para toda la serie (no por repetición) —
        // mismo miembro para todas las ocurrencias.
        const asignado = asignadoA ? resolverMiembro(asignadoA, members) : null;

        const repeticiones = repetir?.veces ?? 1;
        const eventos: CrearEventoResult[] = [];
        try {
          // Secuencial (no Promise.all): son pocas filas (máx. 20) y así el
          // pool de conexiones de Postgres (PgBouncer en modo transacción,
          // ver DATABASE_URL) no recibe una ráfaga simultánea por una sola
          // petición del Asistente.
          for (let i = 0; i < repeticiones; i++) {
            const evento = await prisma.evento.create({
              data: {
                userId,
                workspaceId,
                titulo,
                fechaInicio: repetir ? fechaRepeticion(fecha, repetir.frecuencia, i) : fecha,
                fechaFin: fin ? (repetir ? fechaRepeticion(fin, repetir.frecuencia, i) : fin) : null,
                descripcion: descripcion ?? null,
                ubicacion: ubicacion ?? null,
                participantes: participantes ?? [],
                assigneeId: asignado?.userId ?? null,
              },
            });
            eventos.push({
              id: evento.id,
              titulo: evento.titulo,
              fechaInicio: evento.fechaInicio.toISOString(),
              ubicacion: evento.ubicacion,
              asignadoA: asignado?.email ?? null,
            });
          }
        } catch (err) {
          console.error("La tool crearEvento no pudo guardar el evento:", err);
          Sentry.captureException(err);
          throw new Error(
            eventos.length > 0
              ? `Se guardaron ${eventos.length} de ${repeticiones} eventos, pero hubo un error con el resto. Inténtalo de nuevo en un momento.`
              : "No se ha podido guardar el evento. Inténtalo de nuevo en un momento.",
          );
        }

        try {
          revalidatePath("/calendario");
        } catch (err) {
          console.error("No se pudo invalidar la caché tras crear el evento (no crítico):", err);
        }

        const result: CrearEventoToolResult = {
          eventos,
          asignacionNoEncontrada: asignadoA && !asignado ? asignadoA : undefined,
        };
        return result;
      },
    }),
    completarTarea: tool({
      description:
        "Marca como hecha una tarea o recordatorio pendiente que el usuario dice haber terminado (\"ya he llamado al fontanero\", \"acabé lo del informe\", \"hecho lo de comprar el regalo\"). Busca entre sus pendientes la que mejor coincide con la descripción. Si no hay ninguna coincidencia razonable, dilo con naturalidad — no la llames de nuevo adivinando otra cosa.",
      inputSchema: z.object({
        descripcion: z
          .string()
          .min(1)
          .describe("Descripción de la tarea tal como la menciona el usuario, para buscarla entre sus pendientes."),
      }),
      execute: async ({ descripcion }) => {
        requireWrite();
        let tarea: Message | null;
        try {
          tarea = await encontrarTareaPendiente(workspaceId, descripcion);
        } catch (err) {
          console.error("La tool completarTarea no pudo buscar la tarea:", err);
          Sentry.captureException(err);
          throw new Error("No he podido buscar entre tus pendientes. Inténtalo de nuevo en un momento.");
        }
        if (!tarea) {
          throw new Error("No he encontrado ninguna tarea pendiente que coincida con eso.");
        }

        try {
          // `updateMany` con workspaceId en el where (no `update` por id
          // solo): mismo criterio que el resto de la app — no basta con
          // confiar en que `encontrarTareaPendiente` ya la buscó dentro
          // del workspace correcto, la propia escritura vuelve a
          // comprobarlo.
          const { count } = await prisma.message.updateMany({
            where: { id: tarea.id, workspaceId },
            data: { estado: "HECHO", hecho: true, enProgresoPorId: null, enProgresoDesde: null },
          });
          if (count === 0) throw new Error("La tarea encontrada ya no está en este workspace.");
        } catch (err) {
          console.error("La tool completarTarea no pudo marcarla como hecha:", err);
          Sentry.captureException(err);
          throw new Error("No se ha podido marcar como hecha. Inténtalo de nuevo en un momento.");
        }

        try {
          revalidatePath("/pendientes");
          revalidatePath("/categorias");
        } catch (err) {
          console.error("No se pudo invalidar la caché tras completar la tarea (no crítico):", err);
        }

        const result: CompletarTareaResult = { id: tarea.id, resumen: tarea.resumen, categoria: tarea.categoria };
        return result;
      },
    }),
    aplazarTarea: tool({
      description:
        "Cambia la fecha límite de una tarea o recordatorio pendiente (\"aplaza lo del informe a mañana\", \"pospón la llamada al fontanero a la semana que viene\", \"quita la fecha de la revisión del coche\"). Busca entre sus pendientes la que mejor coincide con la descripción. Resuelve tú la fecha relativa (\"mañana\", \"el viernes\", \"la semana que viene\") a una fecha ISO concreta antes de llamar — no le pases al usuario la carga de dar una fecha exacta. Para quitar la fecha límite sin poner otra, no pases `fecha`.",
      inputSchema: z.object({
        descripcion: z
          .string()
          .min(1)
          .describe("Descripción de la tarea tal como la menciona el usuario, para buscarla entre sus pendientes."),
        fecha: z
          .string()
          .optional()
          .describe("Nueva fecha límite, en formato ISO 8601 (solo la fecha basta). Omite este campo para QUITAR la fecha límite."),
      }),
      execute: async ({ descripcion, fecha }) => {
        requireWrite();
        let nuevaFecha: Date | null = null;
        if (fecha) {
          nuevaFecha = new Date(fecha);
          if (Number.isNaN(nuevaFecha.getTime())) {
            throw new Error("No he entendido bien la fecha. ¿Puedes decírmela de otra forma?");
          }
        }

        let tarea: Message | null;
        try {
          tarea = await encontrarTareaPendiente(workspaceId, descripcion);
        } catch (err) {
          console.error("La tool aplazarTarea no pudo buscar la tarea:", err);
          Sentry.captureException(err);
          throw new Error("No he podido buscar entre tus pendientes. Inténtalo de nuevo en un momento.");
        }
        if (!tarea) {
          throw new Error("No he encontrado ninguna tarea pendiente que coincida con eso.");
        }

        try {
          const { count } = await prisma.message.updateMany({
            where: { id: tarea.id, workspaceId },
            data: { fechaLimite: nuevaFecha },
          });
          if (count === 0) throw new Error("La tarea encontrada ya no está en este workspace.");
        } catch (err) {
          console.error("La tool aplazarTarea no pudo cambiar la fecha:", err);
          Sentry.captureException(err);
          throw new Error("No se ha podido aplazar. Inténtalo de nuevo en un momento.");
        }

        try {
          revalidatePath("/pendientes");
        } catch (err) {
          console.error("No se pudo invalidar la caché tras aplazar la tarea (no crítico):", err);
        }

        const result: AplazarTareaResult = {
          id: tarea.id,
          resumen: tarea.resumen,
          categoria: tarea.categoria,
          fechaLimite: nuevaFecha ? nuevaFecha.toISOString() : null,
        };
        return result;
      },
    }),
    asignarTarea: tool({
      description:
        "Asigna (o quita la asignación de) una tarea o recordatorio pendiente a un compañero de EQUIPO (\"asígnale a María lo de revisar la caldera\", \"que Pedro se encargue de la propuesta\", \"quítale la asignación a lo del informe\"). Busca entre los pendientes del workspace la que mejor coincide con la descripción, igual que `completarTarea`/`aplazarTarea`. Solo tiene sentido en un workspace de equipo — en el personal no hay a quién asignar. Para quitar la asignación sin poner a otra persona, usa `quitarAsignacion` en vez de `asignadoA`.",
      inputSchema: z.object({
        descripcion: z
          .string()
          .min(1)
          .describe("Descripción de la tarea tal como la menciona el usuario, para buscarla entre los pendientes del equipo."),
        asignadoA: z.string().optional().describe("Nombre o email de la persona del equipo a la que asignar."),
        quitarAsignacion: z.boolean().optional().describe("true si pide quitar la asignación sin poner a otra persona."),
      }),
      execute: async ({ descripcion, asignadoA, quitarAsignacion }) => {
        requireWrite();
        if (!asignadoA && !quitarAsignacion) {
          throw new Error("No me has dicho a quién asignarla.");
        }

        let asignado: AssistantWorkspaceMemberInfo | null = null;
        if (asignadoA) {
          asignado = resolverMiembro(asignadoA, members);
          if (!asignado) {
            throw new Error(`No he encontrado a nadie del equipo llamado «${asignadoA}».`);
          }
        }

        let tarea: Message | null;
        try {
          tarea = await encontrarTareaPendiente(workspaceId, descripcion);
        } catch (err) {
          console.error("La tool asignarTarea no pudo buscar la tarea:", err);
          Sentry.captureException(err);
          throw new Error("No he podido buscar entre tus pendientes. Inténtalo de nuevo en un momento.");
        }
        if (!tarea) {
          throw new Error("No he encontrado ninguna tarea pendiente que coincida con eso.");
        }

        try {
          const { count } = await prisma.message.updateMany({
            where: { id: tarea.id, workspaceId },
            data: { assigneeId: asignado?.userId ?? null },
          });
          if (count === 0) throw new Error("La tarea encontrada ya no está en este workspace.");
        } catch (err) {
          console.error("La tool asignarTarea no pudo guardar la asignación:", err);
          Sentry.captureException(err);
          throw new Error("No se ha podido asignar. Inténtalo de nuevo en un momento.");
        }

        try {
          revalidatePath("/pendientes");
        } catch (err) {
          console.error("No se pudo invalidar la caché tras asignar la tarea (no crítico):", err);
        }

        const result: AsignarTareaResult = {
          id: tarea.id,
          resumen: tarea.resumen,
          categoria: tarea.categoria,
          asignadoA: asignado?.email ?? null,
        };
        return result;
      },
    }),
    registrarAhorro: tool({
      description:
        "Apunta un ingreso o retirada en una cuenta de ahorro del usuario (\"he ahorrado 50€ en el fondo de emergencia\", \"he sacado 20€ del viaje\"). Si no existe ninguna cuenta con ese nombre, se crea sobre la marcha — no hace falta preguntar primero. Importe positivo para ingresos, negativo para retiradas. Si el usuario pide que se repita periódicamente (\"que se me añadan 400€ todos los jueves durante 5 semanas\"), usa el parámetro `repetir` en ESTA MISMA llamada para registrar toda la serie de una vez — no llames a la tool varias veces seguidas para eso.",
      inputSchema: z.object({
        cuenta: z
          .string()
          .min(1)
          .describe("Nombre de la cuenta de ahorro tal como la menciona el usuario (p. ej. \"fondo de emergencia\", \"viaje\")."),
        importe: z
          .number()
          .describe("Cantidad en euros. Positiva si es un ingreso/ahorro, negativa si es una retirada/gasto."),
        concepto: z.string().optional().describe("Breve descripción del movimiento, si se menciona."),
        repetir: RepetirSchema.optional().describe(
          "Solo si el movimiento se repite periódicamente. Registra `veces` movimientos idénticos en total, uno por cada `frecuencia` a partir de hoy.",
        ),
      }),
      execute: async ({ cuenta: nombreCuenta, importe, concepto, repetir }) => {
        const centimos = Math.round(importe * 100);
        if (!Number.isFinite(centimos) || centimos === 0) {
          throw new Error("No he entendido el importe. ¿Cuánto es, en euros?");
        }

        let cuenta: CuentaAhorro;
        let cuentaCreada: boolean;
        try {
          const encontrada = await encontrarOCrearCuenta(userId, nombreCuenta);
          cuenta = encontrada.cuenta;
          cuentaCreada = encontrada.creada;
        } catch (err) {
          console.error("La tool registrarAhorro no pudo buscar/crear la cuenta:", err);
          Sentry.captureException(err);
          throw new Error("No he podido buscar tus cuentas de ahorro. Inténtalo de nuevo en un momento.");
        }

        const repeticiones = repetir?.veces ?? 1;
        const ahora = new Date();
        const movimientos: RegistrarAhorroResult[] = [];
        try {
          // Secuencial por el mismo motivo que en crearEvento: pocas filas,
          // sin ráfaga simultánea contra el pool de PgBouncer.
          for (let i = 0; i < repeticiones; i++) {
            const fecha = repetir ? fechaRepeticion(ahora, repetir.frecuencia, i) : ahora;
            const movimiento = await prisma.movimientoAhorro.create({
              data: { cuentaId: cuenta.id, centimos, concepto: concepto?.trim() || null, fecha },
            });
            movimientos.push({
              cuentaId: cuenta.id,
              cuentaNombre: cuenta.nombre,
              centimos,
              fecha: movimiento.fecha.toISOString(),
              cuentaCreada: cuentaCreada && i === 0,
            });
          }
        } catch (err) {
          console.error("La tool registrarAhorro no pudo guardar el movimiento:", err);
          Sentry.captureException(err);
          throw new Error(
            movimientos.length > 0
              ? `Se guardaron ${movimientos.length} de ${repeticiones} movimientos, pero hubo un error con el resto. Inténtalo de nuevo en un momento.`
              : "No se ha podido guardar el movimiento. Inténtalo de nuevo en un momento.",
          );
        }

        try {
          revalidatePath("/ahorros");
        } catch (err) {
          console.error("No se pudo invalidar la caché tras registrar el ahorro (no crítico):", err);
        }

        const result: RegistrarAhorroToolResult = { movimientos };
        return result;
      },
    }),
    editarEvento: tool({
      description:
        "Modifica un evento/cita ya existente del calendario del usuario (cambiar la hora, el título, la ubicación o A QUIÉN está asignado — \"cambia la cita del médico al jueves a las 5\", \"la reunión es en la sala 2, no en mi despacho\", \"asígnasela a María\", \"añade a Pedro como responsable\", \"quítale la asignación\"). Búscalo por descripción entre sus eventos futuros (hoy incluido). Si no encuentra ninguno que coincida, dilo con naturalidad — no la llames de nuevo adivinando otro.",
      inputSchema: z.object({
        descripcion: z
          .string()
          .min(1)
          .describe("Cómo describe el usuario el evento a cambiar, para buscarlo entre los suyos (p. ej. \"la cita del médico\", \"la reunión del jueves\")."),
        tituloNuevo: z.string().optional().describe("Nuevo título, solo si cambia."),
        fechaInicioNueva: z
          .string()
          .optional()
          .describe("Nueva fecha/hora de inicio en ISO 8601 (con el desfase de España), solo si cambia."),
        fechaFinNueva: z.string().optional().describe("Nueva fecha/hora de fin en ISO 8601, solo si cambia."),
        ubicacionNueva: z.string().optional().describe("Nueva ubicación, solo si cambia."),
        asignadoA: z
          .string()
          .optional()
          .describe("Nombre o email de la persona del EQUIPO a la que asignar el evento, solo si pide asignarlo o cambiar a quién está asignado."),
        quitarAsignacion: z.boolean().optional().describe("true si pide quitar la asignación sin poner a otra persona."),
      }),
      execute: async ({ descripcion, tituloNuevo, fechaInicioNueva, fechaFinNueva, ubicacionNueva, asignadoA, quitarAsignacion }) => {
        requireWrite();
        let evento: Evento | null;
        try {
          evento = await encontrarEvento(workspaceId, descripcion);
        } catch (err) {
          console.error("La tool editarEvento no pudo buscar el evento:", err);
          Sentry.captureException(err);
          throw new Error("No he podido buscar tus eventos. Inténtalo de nuevo en un momento.");
        }
        if (!evento) {
          throw new Error("No he encontrado ningún evento próximo que coincida con eso.");
        }

        const asignado = asignadoA ? resolverMiembro(asignadoA, members) : null;
        // `quitarAsignacion` siempre gana si por lo que sea llegan los dos a
        // la vez — y el resultado que se informa abajo usa ESTE valor, no
        // `asignado`, para no decir "asignada a X" cuando en realidad se
        // ha guardado sin asignar.
        const asignadoEfectivo = quitarAsignacion ? null : asignado;

        const data: { titulo?: string; fechaInicio?: Date; fechaFin?: Date; ubicacion?: string; assigneeId?: string | null } = {};
        if (tituloNuevo) data.titulo = tituloNuevo;
        if (ubicacionNueva) data.ubicacion = ubicacionNueva;
        if (fechaInicioNueva) {
          const fecha = new Date(fechaInicioNueva);
          if (Number.isNaN(fecha.getTime())) throw new Error("No he entendido bien la nueva fecha. ¿Puedes decírmela de otra forma?");
          data.fechaInicio = fecha;
        }
        if (fechaFinNueva) {
          const fin = new Date(fechaFinNueva);
          if (Number.isNaN(fin.getTime())) throw new Error("No he entendido bien la nueva fecha de fin.");
          data.fechaFin = fin;
        }
        if (quitarAsignacion) data.assigneeId = null;
        else if (asignado) data.assigneeId = asignado.userId;
        if (Object.keys(data).length === 0) {
          throw new Error(
            asignadoA
              ? `No he encontrado a nadie del equipo llamado «${asignadoA}».`
              : "No me has dicho qué cambiar del evento.",
          );
        }

        let actualizado: Evento;
        try {
          // `updateMany` con workspaceId — mismo motivo que en
          // completarTarea: la escritura vuelve a comprobar el acceso,
          // no confía solo en la búsqueda previa.
          const { count } = await prisma.evento.updateMany({ where: { id: evento.id, workspaceId }, data });
          if (count === 0) throw new Error("El evento encontrado ya no está en este workspace.");
          actualizado = { ...evento, ...data };
        } catch (err) {
          console.error("La tool editarEvento no pudo guardar los cambios:", err);
          Sentry.captureException(err);
          throw new Error("No se han podido guardar los cambios. Inténtalo de nuevo en un momento.");
        }

        try {
          revalidatePath("/calendario");
        } catch (err) {
          console.error("No se pudo invalidar la caché tras editar el evento (no crítico):", err);
        }

        const result: EditarEventoResult = {
          id: actualizado.id,
          titulo: actualizado.titulo,
          fechaInicio: actualizado.fechaInicio.toISOString(),
          ubicacion: actualizado.ubicacion,
          asignadoA: asignadoEfectivo?.email ?? null,
          asignacionNoEncontrada: asignadoA && !asignado ? asignadoA : undefined,
        };
        return result;
      },
    }),
    borrarEvento: tool({
      description:
        "Borra un evento/cita del calendario del usuario (\"cancela la cita del médico\", \"quita la reunión del jueves\"). Búscalo por descripción entre sus eventos futuros (hoy incluido). Si no encuentra ninguno que coincida, dilo con naturalidad.",
      inputSchema: z.object({
        descripcion: z
          .string()
          .min(1)
          .describe("Cómo describe el usuario el evento a borrar, para buscarlo entre los suyos."),
      }),
      execute: async ({ descripcion }) => {
        requireWrite();
        let evento: Evento | null;
        try {
          evento = await encontrarEvento(workspaceId, descripcion);
        } catch (err) {
          console.error("La tool borrarEvento no pudo buscar el evento:", err);
          Sentry.captureException(err);
          throw new Error("No he podido buscar tus eventos. Inténtalo de nuevo en un momento.");
        }
        if (!evento) {
          throw new Error("No he encontrado ningún evento próximo que coincida con eso.");
        }

        try {
          // `deleteMany` con workspaceId — mismo motivo que en
          // completarTarea/editarEvento.
          const { count } = await prisma.evento.deleteMany({ where: { id: evento.id, workspaceId } });
          if (count === 0) throw new Error("El evento encontrado ya no está en este workspace.");
        } catch (err) {
          console.error("La tool borrarEvento no pudo borrar el evento:", err);
          Sentry.captureException(err);
          throw new Error("No se ha podido borrar el evento. Inténtalo de nuevo en un momento.");
        }

        try {
          revalidatePath("/calendario");
        } catch (err) {
          console.error("No se pudo invalidar la caché tras borrar el evento (no crítico):", err);
        }

        const result: BorrarEventoResult = { id: evento.id, titulo: evento.titulo };
        return result;
      },
    }),
    consultarAhorros: tool({
      description:
        "Consulta cuánto tiene ahorrado el usuario, en una cuenta concreta o en todas (\"¿cuánto llevo ahorrado?\", \"¿cuánto tengo en el fondo de emergencia?\"). De solo lectura — nunca modifica nada, úsala para poder responder con el dato real en vez de inventarlo.",
      inputSchema: z.object({
        cuenta: z
          .string()
          .optional()
          .describe("Nombre de la cuenta si pregunta por una en concreto; omite si pregunta por el total o por todas sus cuentas."),
      }),
      execute: async ({ cuenta: nombreCuenta }) => {
        let cuentas;
        try {
          cuentas = await getCuentasConSaldo(userId);
        } catch (err) {
          console.error("La tool consultarAhorros no pudo leer las cuentas:", err);
          Sentry.captureException(err);
          throw new Error("No he podido consultar tus ahorros. Inténtalo de nuevo en un momento.");
        }

        if (nombreCuenta) {
          const normalizado = normalizeForMatch(nombreCuenta);
          const match = cuentas.find((c) => {
            const n = normalizeForMatch(c.nombre);
            return n.includes(normalizado) || normalizado.includes(n);
          });
          if (!match) {
            throw new Error(`No encuentro ninguna cuenta de ahorro parecida a "${nombreCuenta}".`);
          }
          const result: ConsultarAhorrosResult = {
            cuentas: [{ nombre: match.nombre, saldoCentimos: match.saldoCentimos }],
            totalCentimos: match.saldoCentimos,
          };
          return result;
        }

        const result: ConsultarAhorrosResult = {
          cuentas: cuentas.map((c) => ({ nombre: c.nombre, saldoCentimos: c.saldoCentimos })),
          totalCentimos: cuentas.reduce((sum, c) => sum + c.saldoCentimos, 0),
        };
        return result;
      },
    }),
    consultarEquipo: tool({
      description:
        "Consulta quién forma parte del equipo, si está en línea, su estado (disponible/ocupado/fuera, elegido por cada uno) y en qué tarea está trabajando ahora mismo si hay alguna. Úsala para preguntas como '¿quién está en línea?', '¿qué está haciendo María?', '¿cómo está el equipo ahora?'. Solo tiene sentido en un workspace de equipo — en el personal no hay a quién consultar.",
      inputSchema: z.object({}),
      execute: async () => {
        if (members.length === 0) {
          throw new Error("Estás en tu espacio personal — no hay equipo que consultar aquí.");
        }
        try {
          const [info, enCurso] = await Promise.all([
            listWorkspaceMembers(workspaceId, userId),
            prisma.message.findMany({
              where: { workspaceId, enProgresoPorId: { not: null } },
              select: { resumen: true, enProgresoPorId: true },
            }),
          ]);
          const tareaPorUsuario = new Map(enCurso.map((m) => [m.enProgresoPorId!, m.resumen]));
          return {
            miembros: info
              .filter((m) => m.status === "ACTIVE")
              .map((m) => ({
                email: m.email,
                enLinea: isOnline(m.lastSeenAt),
                estado: m.presenceStatus ?? "DISPONIBLE",
                tareaEnCurso: tareaPorUsuario.get(m.userId) ?? null,
              })),
          };
        } catch (err) {
          console.error("La tool consultarEquipo no pudo leer el equipo:", err);
          Sentry.captureException(err);
          throw new Error("No he podido consultar el equipo. Inténtalo de nuevo en un momento.");
        }
      },
    }),
    analizarEquipo: tool({
      description:
        "Analiza cómo está repartido el trabajo del equipo AHORA MISMO: pendientes, en progreso, vencidas y completadas en la última semana, por persona, más el total del equipo — para dar un diagnóstico o consejo de gestión CONCRETO, con nombres y números reales (\"¿cómo va el equipo?\", \"¿quién está más cargado?\", \"tengo un problema de organización, ayúdame\", \"¿cómo repartimos mejor las tareas?\"). De solo lectura — nunca modifica nada. Solo tiene sentido en un workspace de equipo.",
      inputSchema: z.object({}),
      execute: async () => {
        if (members.length === 0) {
          throw new Error("Estás en tu espacio personal — no hay equipo que analizar aquí.");
        }
        try {
          const now = new Date();
          const sieteDiasAtras = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const [abiertas, completadasRecientes] = await Promise.all([
            prisma.message.findMany({
              where: { workspaceId, estado: { in: ["POR_HACER", "EN_PROGRESO"] } },
              select: { assigneeId: true, estado: true, fechaLimite: true, categoria: true, enProgresoPorId: true },
            }),
            prisma.message.findMany({
              where: { workspaceId, estado: "HECHO", fecha: { gte: sieteDiasAtras } },
              select: { assigneeId: true },
            }),
          ]);

          const porMiembro = new Map(
            members.map((m) => [
              m.userId,
              { email: m.email, pendientes: 0, enProgreso: 0, vencidas: 0, completadasUltimaSemana: 0, trabajandoAhora: false },
            ]),
          );
          const categoriaCounts = new Map<string, number>();
          let totalVencidas = 0;

          for (const t of abiertas) {
            categoriaCounts.set(t.categoria, (categoriaCounts.get(t.categoria) ?? 0) + 1);
            const vencida = t.fechaLimite != null && t.fechaLimite < now;
            if (vencida) totalVencidas++;
            const entry = t.assigneeId ? porMiembro.get(t.assigneeId) : undefined;
            if (!entry) continue;
            if (t.estado === "POR_HACER") entry.pendientes++;
            if (t.estado === "EN_PROGRESO") entry.enProgreso++;
            if (vencida) entry.vencidas++;
            if (t.enProgresoPorId) entry.trabajandoAhora = true;
          }
          for (const t of completadasRecientes) {
            const entry = t.assigneeId ? porMiembro.get(t.assigneeId) : undefined;
            if (entry) entry.completadasUltimaSemana++;
          }

          const categoriaMasFrecuente = [...categoriaCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

          return {
            porMiembro: [...porMiembro.values()],
            totalPendientesYEnProgreso: abiertas.length,
            totalVencidas,
            categoriaMasFrecuente,
          };
        } catch (err) {
          console.error("La tool analizarEquipo no pudo calcular las métricas:", err);
          Sentry.captureException(err);
          throw new Error("No he podido analizar el equipo. Inténtalo de nuevo en un momento.");
        }
      },
    }),
    consultarPersona: tool({
      description:
        "Ficha completa de UNA persona por su nombre o email (\"¿qué hace Carlos?\", \"¿qué lleva María?\", \"¿quién es carlosgallardo?\", \"¿está ocupado Pedro?\"): en qué equipos está y con qué rol, si está en línea, qué tiene entre manos ahora mismo, sus tareas abiertas con fechas límite (marcando las vencidas), cuántas cerró la última semana y sus próximas citas. Busca en TODOS los equipos del usuario, no solo en el que tenga abierto. De solo lectura. Llámala siempre que pregunten por una persona concreta — nunca respondas que no tienes información sobre alguien sin haberla llamado antes.",
      inputSchema: z.object({
        nombre: z.string().min(1).describe("Nombre o email de la persona, tal como lo dijo el usuario (\"Carlos\", \"carlosgallardo\", \"ana@empresa.com\")."),
      }),
      execute: async ({ nombre }) => {
        try {
          const persona = await resolvePersona(userId, nombre);
          if (!persona) {
            throw new Error(`No encuentro a nadie llamado "${nombre}" en ninguno de tus equipos.`);
          }
          return persona;
        } catch (err) {
          if (err instanceof Error && err.message.startsWith("No encuentro")) throw err;
          console.error("La tool consultarPersona no pudo leer la ficha:", err);
          Sentry.captureException(err);
          throw new Error("No he podido consultar a esa persona. Inténtalo de nuevo en un momento.");
        }
      },
    }),
    consultarMisEquipos: tool({
      description:
        "Lista TODOS los equipos a los que pertenece el usuario, con su rol en cada uno, cuánta gente hay y cuánto trabajo abierto tiene cada uno, marcando cuál es el que tiene seleccionado ahora (\"¿en qué equipos estoy?\", \"¿cuántos equipos tengo?\", \"¿en cuál hay más trabajo?\"). De solo lectura. Úsala para poder DIFERENCIAR entre equipos al responder, en vez de hablar de \"el equipo\" como si solo hubiera uno.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const equipos = await resolveMisEquipos(userId, workspaceId);
          if (equipos.length === 0) {
            throw new Error("Todavía no perteneces a ningún equipo — solo tienes tu espacio personal.");
          }
          return { equipos };
        } catch (err) {
          if (err instanceof Error && err.message.startsWith("Todavía no perteneces")) throw err;
          console.error("La tool consultarMisEquipos no pudo leer los equipos:", err);
          Sentry.captureException(err);
          throw new Error("No he podido consultar tus equipos. Inténtalo de nuevo en un momento.");
        }
      },
    }),
    consultarAgenda: tool({
      description:
        "Qué hay entre dos fechas: citas del calendario Y tareas que vencen, mezcladas en orden cronológico (\"¿qué tengo esta semana?\", \"¿qué hay mañana?\", \"¿qué tiene Ana el jueves?\", \"¿qué se viene en agosto?\"). Cubre todos los equipos del usuario más su espacio personal, e indica de qué equipo es cada cosa y quién la lleva. De solo lectura. Calcula tú `desde`/`hasta` en ISO 8601 a partir de la fecha actual — `hasta` es exclusivo (para \"mañana\", pon el día siguiente como `hasta`).",
      inputSchema: z.object({
        desde: z.string().describe("Inicio del tramo, en ISO 8601 (p. ej. \"2026-08-18T00:00:00+02:00\")."),
        hasta: z.string().describe("Fin del tramo, en ISO 8601, EXCLUSIVO — lo que caiga justo en esta fecha ya no entra."),
        dePersona: z
          .string()
          .optional()
          .describe("Nombre o email si preguntan por lo que lleva alguien en concreto; omítelo para ver todo lo que el usuario puede ver."),
      }),
      execute: async ({ desde, hasta, dePersona }) => {
        const inicio = new Date(desde);
        const fin = new Date(hasta);
        if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
          throw new Error("Las fechas del tramo no son válidas.");
        }
        if (fin <= inicio) {
          throw new Error("El final del tramo tiene que ser posterior al principio.");
        }
        try {
          const items = await resolveAgenda(userId, inicio, fin, personalWorkspaceId, dePersona);
          return { items, total: items.length };
        } catch (err) {
          console.error("La tool consultarAgenda no pudo leer la agenda:", err);
          Sentry.captureException(err);
          throw new Error("No he podido consultar la agenda. Inténtalo de nuevo en un momento.");
        }
      },
    }),
    enviarMensajeChat: tool({
      description:
        "Envía un mensaje al chat de equipo en nombre del usuario (\"dile al equipo que llego tarde\", \"escribe en el chat que ya está listo\"). Llámala directamente cuando pida avisar, decir o escribir algo al equipo — no preguntes primero si quiere que lo hagas. Solo en un workspace de equipo.",
      inputSchema: z.object({
        texto: z.string().min(1).describe("El mensaje tal como debe aparecer en el chat."),
      }),
      execute: async ({ texto }) => {
        if (members.length === 0) {
          // El chat SÍ existe en el espacio personal desde que dejó de estar
          // atado al workspace (conversaciones y grupos propios) — lo que no
          // hay aquí es un grupo "de equipo" al que escribir. Decir "no hay
          // chat" a secas sería mentira y confundiría a quien lo tiene
          // delante en el menú.
          throw new Error(
            "Ahora mismo estás en tu espacio personal, así que no hay ningún equipo al que escribir. Cámbiate al equipo desde el selector y vuelve a pedírmelo (tus conversaciones personales siguen en el Chat).",
          );
        }
        // "El equipo" en boca del usuario es el grupo por defecto, no una
        // conversación individual/otro grupo concreto — el Asistente no
        // tiene forma de saber a cuál de varios grupos se refiere, así que
        // siempre escribe al que agrupa a todo el workspace (ver
        // ensureDefaultGroupConversation).
        const conversationId = await ensureDefaultGroupConversation(workspaceId, userId);
        const result = await postChatMessage(conversationId, workspaceId, userId, texto);
        if (result.error || !result.message) {
          throw new Error(result.error || "No se ha podido enviar el mensaje al chat.");
        }
        return { texto: result.message.texto };
      },
    }),
    recordarPreferencia: tool({
      description:
        "Guarda un hecho o preferencia sobre el usuario o su negocio para recordarlo SIEMPRE, en cualquier conversación futura (no solo en esta) — cosas como horarios, prioridades fijas de un cliente, o cómo prefiere que le hables. Llámala cuando el usuario te pida explícitamente que recuerdes algo (\"recuerda que los jueves cierro antes\", \"a partir de ahora háblame de tú\"), o cuando detectes tú mismo un patrón claro y repetido y tenga sentido ofrecerte a recordarlo. No la uses para hechos de una sola vez sin valor futuro (para eso ya existe crearNota).",
      inputSchema: z.object({
        hecho: z.string().min(1).describe("El hecho o preferencia, en una frase corta y clara, tal como debe recordarse."),
      }),
      execute: async ({ hecho }) => {
        try {
          const saved = await saveAssistantMemory(userId, workspaceId, hecho);
          return { hecho: saved.hecho };
        } catch (err) {
          console.error("La tool recordarPreferencia no pudo guardar el hecho:", err);
          Sentry.captureException(err);
          throw new Error("No he podido guardar eso. Inténtalo de nuevo en un momento.");
        }
      },
    }),
    olvidarPreferencia: tool({
      description:
        "Olvida un hecho o preferencia guardada antes con recordarPreferencia, descrito en lenguaje libre (\"olvida lo de que cierro los jueves antes\"). Si no encuentra nada parecido, dilo con naturalidad — no inventes que lo has olvidado si no había nada guardado.",
      inputSchema: z.object({
        descripcion: z.string().min(1).describe("Descripción libre de qué hecho olvidar, tal como lo diría el usuario."),
      }),
      execute: async ({ descripcion }) => {
        try {
          const forgotten = await forgetAssistantMemory(userId, workspaceId, descripcion);
          if (!forgotten) throw new Error(`No tengo nada guardado parecido a "${descripcion}".`);
          return { olvidado: true };
        } catch (err) {
          if (err instanceof Error && err.message.startsWith("No tengo nada guardado")) throw err;
          console.error("La tool olvidarPreferencia no pudo borrar el hecho:", err);
          Sentry.captureException(err);
          throw new Error("No he podido olvidar eso. Inténtalo de nuevo en un momento.");
        }
      },
    }),
  } satisfies ToolSet;

  /**
   * Solo se le pasa al modelo el juego de herramientas que puede usar EN
   * ESTE MODO. Antes se le mandaban las 17 en cada petición, incluidas las
   * seis de equipo estando en personal (o las dos de ahorro estando en
   * equipo) — más tokens y latencia de más en cada turno, y la posibilidad
   * de que intentara algo que iba a fallar seguro. `members.length > 0` es
   * la misma señal que ya usan estas tools por dentro para saber si están
   * en un workspace de equipo (ver el "if (members.length === 0) throw"
   * repetido en consultarEquipo/analizarEquipo/enviarMensajeChat) — no se
   * inventa un criterio nuevo, solo se aplica también aquí fuera.
   *
   * El `as typeof todas` no le miente a quien consume `AssistantTools`
   * (abajo): ese tipo describe TODOS los esquemas que el cliente podría
   * necesitar pintar alguna vez (ver InferUITools en AssistantProvider.tsx),
   * no los que de verdad viajan en esta petición concreta — el modelo,
   * sencillamente, no puede llamar a lo que no está en el objeto real.
   */
  const enEquipo = members.length > 0;
  const SOLO_EQUIPO = ["asignarTarea", "consultarEquipo", "analizarEquipo", "consultarPersona", "consultarMisEquipos", "enviarMensajeChat"] as const;
  const SOLO_PERSONAL = ["registrarAhorro", "consultarAhorros"] as const;
  const excluidas = new Set<string>(enEquipo ? SOLO_PERSONAL : SOLO_EQUIPO);
  return Object.fromEntries(Object.entries(todas).filter(([nombre]) => !excluidas.has(nombre))) as typeof todas;
}

export type AssistantTools = ReturnType<typeof createAssistantTools>;
