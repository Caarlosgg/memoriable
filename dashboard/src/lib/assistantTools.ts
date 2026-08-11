import "server-only";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { Message, CuentaAhorro, Evento } from "@prisma/client";
import { captureMessage, resolveEmbedder } from "./pipeline";
import { toAssistantSource } from "./assistantContext";
import { ACTIONABLE_CATEGORIES } from "./categories";
import { findSimilarMessages } from "./vectorSearch";
import { getCuentasConSaldo } from "./ahorros";
import { FRECUENCIAS, fechaRepeticion } from "./calendar";
import { canWrite, READONLY_ROLE_MESSAGE } from "./workspace";
import { prisma } from "./prisma";
import type { WorkspaceRole } from "@prisma/client";

/**
 * Normaliza texto para comparar por voz: minúsculas + sin tildes/diacríticos.
 * Sin esto, "Reunión" (guardado con tilde) y "reunion" (como lo dice o lo
 * transcribe el usuario, o como lo normaliza el propio modelo) no
 * coinciden con un `includes` normal — un fallo real de coincidencia
 * detectado en verificación en vivo, no algo teórico.
 */
function normalizeForMatch(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
}

export interface CrearEventoResult {
  id: string;
  titulo: string;
  fechaInicio: string;
  ubicacion: string | null;
}

export interface CrearEventoToolResult {
  eventos: CrearEventoResult[];
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
      const similares = await findSimilarMessages(workspaceId, embedding, { limit: 8 });
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
 */
export function createAssistantTools(userId: string, workspaceId: string, role: WorkspaceRole) {
  // Solo bloquea las 5 tools que escriben notas/eventos del workspace
  // activo — registrarAhorro/consultarAhorros ignoran el rol a propósito
  // (Ahorros es siempre personal, ver el comentario de arriba).
  function requireWrite(): void {
    if (!canWrite(role)) throw new Error(READONLY_ROLE_MESSAGE);
  }
  return {
    crearNota: tool({
      description:
        "Crea y guarda una nota, tarea o recordatorio nuevo SIN fecha/hora concreta, categorizándolo automáticamente (igual que la captura rápida del dashboard). Llámala directamente en el mismo turno cuando el usuario pida crear, apuntar, anotar o recordar algo — no preguntes primero si quiere que lo hagas. NO la uses si lo que pide tiene fecha/hora concreta (una cita, quedar con alguien) o se repite periódicamente ('todos los jueves', 'cada semana') — para eso usa crearEvento (con su parámetro repetir si se repite), aunque suene a 'tarea'.",
      inputSchema: z.object({
        contenido: z
          .string()
          .min(1)
          .describe("El texto de la nota/tarea/recordatorio tal como lo diría el usuario, listo para guardar y categorizar."),
      }),
      execute: async ({ contenido }) => {
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
        return toAssistantSource(saved);
      },
    }),
    crearEvento: tool({
      description:
        "Crea una cita o evento con fecha y hora concreta en el calendario del usuario. Llámala cuando describa algo con fecha/hora clara (\"quedar el jueves a las 5\", \"cita con el médico el 12 a las 10\"). Si falta la hora o la fecha es ambigua, pregunta antes de llamarla — nunca inventes una hora que no te han dado. Si es algo que se repite en el tiempo (\"todos los jueves durante 5 semanas\", \"cada día esta semana\"), usa el parámetro `repetir` en ESTA MISMA llamada para crear toda la serie de una vez — no llames a la tool varias veces seguidas para eso.",
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
          .describe("Nombres de las personas mencionadas, si las hay."),
        repetir: RepetirSchema.optional().describe(
          "Solo si el evento se repite periódicamente. Crea `veces` eventos en total, uno por cada `frecuencia` a partir de fechaInicio/fechaFin.",
        ),
      }),
      execute: async ({ titulo, fechaInicio, fechaFin, descripcion, ubicacion, participantes, repetir }) => {
        requireWrite();
        const fecha = new Date(fechaInicio);
        if (Number.isNaN(fecha.getTime())) {
          throw new Error("No he entendido bien la fecha. ¿Puedes decírmela de otra forma (día y hora)?");
        }
        const fin = fechaFin ? new Date(fechaFin) : null;
        if (fin && Number.isNaN(fin.getTime())) {
          throw new Error("No he entendido bien la fecha de fin.");
        }

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
              },
            });
            eventos.push({
              id: evento.id,
              titulo: evento.titulo,
              fechaInicio: evento.fechaInicio.toISOString(),
              ubicacion: evento.ubicacion,
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

        const result: CrearEventoToolResult = { eventos };
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
        "Modifica un evento/cita ya existente del calendario del usuario (cambiar la hora, el título o la ubicación — \"cambia la cita del médico al jueves a las 5\", \"la reunión es en la sala 2, no en mi despacho\"). Búscalo por descripción entre sus eventos futuros (hoy incluido). Si no encuentra ninguno que coincida, dilo con naturalidad — no la llames de nuevo adivinando otro.",
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
      }),
      execute: async ({ descripcion, tituloNuevo, fechaInicioNueva, fechaFinNueva, ubicacionNueva }) => {
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

        const data: { titulo?: string; fechaInicio?: Date; fechaFin?: Date; ubicacion?: string } = {};
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
        if (Object.keys(data).length === 0) {
          throw new Error("No me has dicho qué cambiar del evento.");
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
  } satisfies ToolSet;
}

export type AssistantTools = ReturnType<typeof createAssistantTools>;
