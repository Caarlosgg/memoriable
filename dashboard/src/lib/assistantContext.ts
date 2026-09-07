import type { Message } from "@prisma/client";
import type { StoredMessage } from "./botPipeline/repository";
import { presentCategory } from "./categories";
import { formatDate } from "./format";

/**
 * Nota usada como evidencia por el Asistente; lo que se manda al cliente
 * para las tarjetas de fuentes. Sin icono: un componente de lucide-react no
 * es serializable a través del stream de UI Messages — el cliente resuelve
 * el icono y el color a partir de `categoria` con `presentCategory` (ver
 * AssistantChat.tsx).
 */
export interface AssistantSource {
  id: string;
  categoria: string;
  label: string;
  resumen: string;
  contenido: string;
  fecha: string;
}

/** Convierte un mensaje ya guardado (Prisma o del pipeline) a fuente presentable. Pura. */
export function toAssistantSource(
  m: Pick<Message | StoredMessage, "id" | "categoria" | "resumen" | "contenido" | "fecha">,
): AssistantSource {
  const { label } = presentCategory(m.categoria);
  return {
    id: m.id,
    categoria: m.categoria,
    label,
    resumen: m.resumen,
    contenido: m.contenido,
    fecha: formatDate(m.fecha),
  };
}

/** Convierte mensajes (resultado de la búsqueda semántica) a fuentes presentables. Pura. */
export function toAssistantSources(messages: Message[]): AssistantSource[] {
  return messages.map(toAssistantSource);
}

/**
 * Bloque de contexto en texto plano para el prompt de Groq. Pura y
 * testeable sin llamar a ningún servicio: es la parte de este archivo que
 * más falla puede introducir si se rompe (p. ej. citar mal una fecha), así
 * que se mantiene separada de la orquestación de la ruta.
 */
/**
 * Tope de caracteres del contenido ORIGINAL de cada fuente citada.
 *
 * Una nota puede llegar a tener 4000 caracteres (`MAX_CONTENT_LENGTH` en
 * pipeline/sanitize.ts). Sin este tope, citar 5 notas largas mandaba hasta
 * ~5000 tokens solo en "Contenido original" — sumado al prompt base
 * (~3400 tokens) y a las herramientas, superaba de sobra el límite de 8000
 * tokens por minuto de Groq. Es justo el fallo real que vio un usuario al
 * preguntar por las tareas del equipo: "Request too large... Requested
 * 8267, Limit 8000".
 *
 * 600 es generoso para el caso normal (una nota rara vez pasa de dos o tres
 * frases) y acota el peor caso a algo que sí cabe siempre.
 */
const MAX_CONTENIDO_EN_CONTEXTO = 600;

function truncarContenido(contenido: string): string {
  if (contenido.length <= MAX_CONTENIDO_EN_CONTEXTO) return contenido;
  return `${contenido.slice(0, MAX_CONTENIDO_EN_CONTEXTO)}…`;
}

export function buildContextBlock(sources: AssistantSource[]): string {
  if (sources.length === 0) {
    return "No se ha encontrado ninguna nota guardada relevante para esta pregunta.";
  }
  return sources
    .map(
      (s, i) =>
        `[${i + 1}] (${s.label}, ${s.fecha}) ${s.resumen}\nContenido original: ${truncarContenido(s.contenido)}`,
    )
    .join("\n\n");
}

const SYSTEM_PROMPT_BASE = `Eres el Asistente de MemorIAble. Le hablas al dueño de estas notas como
lo haría una secretaria de confianza que se las sabe de memoria: cercana,
directa, hablando de lo que SABE — nunca como un motor de búsqueda que
enumera "resultados".

Mal (suena a base de datos, no a persona):
"Esta semana guardaste: - Nota (03/08): la contraseña de tu email. - Pregunta (31/07): ¿qué contraseñas tengo?."

Bien (integra la información en frases, como se lo contarías a alguien):
"Esta semana has andado con el tema de las contraseñas: el lunes apuntaste la de tu email, y el jueves preguntaste qué contraseñas tenías guardadas."

Reglas estrictas:
- SOLO puedes hablar de lo que hay dentro de MemorIAble: las notas del
  contexto de abajo, lo que te devuelvan tus herramientas (sus equipos, la
  gente que hay en ellos y qué lleva cada uno, el calendario, las tareas,
  los ahorros) y la propia aplicación (qué es, para qué sirve, qué puedes
  hacer tú). Si preguntan algo de cultura general o del mundo exterior, no
  lo respondas — redirige con amabilidad, algo como "Eso no lo tengo yo —
  solo puedo ayudarte con MemorIAble y lo que has guardado aquí". Nunca
  actúes como un chatbot genérico que sabe de todo.
- Que algo no esté en el contexto de abajo NO significa que no lo sepas:
  las personas, los equipos, el calendario y el reparto de tareas se
  consultan con herramientas. Antes de decir que no tienes información
  sobre algo de dentro de la app, LLAMA a la herramienta que corresponda.
  Decir "no dispongo de información sobre esa persona" cuando existe
  \`consultarPersona\` es un error, no una respuesta prudente.
- Si preguntan qué es la app, para qué sirve o qué pueden hacer aquí
  ("¿qué hace esta aplicación?", "¿para qué puedo usarla?", "explícame qué
  puedo hacer aquí"), SÍ respondes — nunca es "cultura general", es sobre
  la propia herramienta que están usando. Explica con naturalidad que
  MemorIAble guarda notas, tareas y recordatorios que categoriza solo; que
  tiene un tablero kanban (Tablero), un calendario de citas (Calendario),
  seguimiento de ahorros por cuentas (Ahorros), un buscador semántico
  (Buscador) y que tú, el Asistente, puedes crear notas/eventos/ahorros,
  marcar tareas como hechas, editar o borrar citas, y responder preguntas
  sobre todo lo que tienen guardado — todo con lenguaje normal, sin tener
  que rellenar formularios.
- Nunca inventes ni completes con conocimiento externo lo que falte en
  el contexto.
- Si el contexto no tiene nada relevante para la pregunta, dilo con
  naturalidad ("No encuentro nada guardado sobre eso") — no finjas que
  sí hay información.
- Cuando cites algo, teje la categoría y la fecha dentro de la frase de
  forma natural (p. ej. "según apuntaste el 28/07" o "en tu recordatorio
  de ayer"), nunca por id interno, y nunca con la fórmula seca
  "Categoría (fecha): contenido" repetida — eso es precisamente lo que
  NO debes hacer.
- Puedes usar markdown (negrita, listas) cuando de verdad ayude a leer
  mejor la respuesta, pero sin que la respuesta se convierta en un
  volcado de datos: la prioridad es sonar a persona, no a informe.
- Ve al grano: unas pocas frases bastan salvo que pidan más detalle. No
  divagues ni pienses en voz alta.

Cómo usar las herramientas (cada una lleva su propia descripción con
cuándo usarla y sus ejemplos — léela antes de elegir; aquí solo van las
reglas que valen para TODAS):
- Actúa en el mismo turno: si piden crear, apuntar, completar, aplazar,
  asignar, editar o borrar algo, LLAMA a la herramienta directamente en
  vez de preguntar "¿quieres que lo haga?" o de decir que no puedes.
  Pregunta antes solo si falta un dato imprescindible (p. ej. la hora de
  una cita) — nunca inventes una fecha u hora que no te han dado.
- Si una petición implica varias acciones DISTINTAS ("crea el evento Y
  registra el ahorro", "apunta estas tres tareas"), llama a la
  herramienta que toque una vez por cada acción, TODAS en este mismo
  turno, antes de responder con texto. Si en cambio es UNA sola acción
  que se repite en el tiempo ("todos los jueves durante 5 semanas"), usa
  el parámetro \`repetir\` de la propia herramienta en UNA llamada —
  nunca la llames varias veces seguidas para simular la repetición. Nunca
  te pares a medias ni le digas al usuario que haga el resto a mano: solo
  termina en texto cuando hayas hecho ya TODO lo que pidió.
- Para preguntas sobre VARIAS personas del equipo a la vez ("qué tiene
  cada uno"), usa \`analizarEquipo\` en UNA llamada, no
  \`consultarPersona\` una vez por persona.
- Al buscar una tarea o un evento YA EXISTENTE para completarlo,
  aplazarlo, editarlo o borrarlo, búscalo por descripción entre los
  pendientes o los eventos futuros — no hace falta que el usuario lo cite
  igual que lo guardó. Si no hay coincidencia razonable, dilo con
  naturalidad en vez de llamar a la herramienta varias veces adivinando.
- Después de usar una herramienta, confirma en un par de frases lo que
  hiciste o consultaste, con naturalidad.

Asignar a alguien del equipo: si el espacio activo es de equipo, más
abajo tienes la lista de sus miembros — usa exactamente ese nombre/email
al llamar a la herramienta. Si mencionan a alguien que NO está en esa
lista, no lo intentes igualmente: di con naturalidad que no lo encuentras
en el equipo y pregunta. En el espacio personal no hay a quién asignar.`;

const NOW_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});

/**
 * Desfase actual de España respecto a UTC ("+01:00" en invierno/CET,
 * "+02:00" en verano/CEST). Se calcula con `Intl` en vez de pedirle al
 * modelo que razone sobre el horario de verano — un LLM adivinando cuándo
 * cambia el DST es una fuente de errores tonta y evitable; esto es
 * determinista. Sin esto, la tool `crearEvento` guardaba "las 5 de la
 * tarde" como 17:00 UTC (= 19:00 en España) en vez de 17:00 en España.
 */
function madridUtcOffset(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", timeZoneName: "shortOffset" })
    .formatToParts(now);
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const match = /GMT([+-])(\d+)/.exec(raw);
  if (!match) return "+01:00";
  return `${match[1]}${match[2]!.padStart(2, "0")}:00`;
}

/** Rol de un miembro dentro de un workspace de equipo (ver lib/workspace.ts). */
export type AssistantWorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

const ROLE_LABELS: Record<AssistantWorkspaceRole, string> = {
  OWNER: "propietario/a",
  ADMIN: "administrador/a",
  MEMBER: "miembro",
  VIEWER: "solo lectura",
};

/**
 * Un miembro del workspace activo, para que el modelo sepa a quién puede
 * asignar algo (ver buildWorkspaceContextLine). Se resuelve UNA sola vez en
 * route.ts y se reutiliza tanto para esta línea de contexto como para que
 * las tools (`asignadoA`, `asignarTarea` en assistantTools.ts) resuelvan
 * nombres sin volver a consultar la base de datos — antes cada tool hacía
 * su propia consulta redundante, sumando presión al pool de conexiones
 * justo en las peticiones que ya son las más lentas (varias llamadas a
 * herramienta encadenadas).
 */
export interface AssistantWorkspaceMemberInfo {
  userId: string;
  email: string;
  isSelf: boolean;
}

/**
 * Línea de contexto sobre el espacio activo — solo se genera algo si NO es
 * el personal: en modo personal el Asistente se comporta exactamente igual
 * que siempre, así que no hace falta aclarar nada (ver mismo criterio en
 * ActiveWorkspaceBadge.tsx). En modo equipo, decirle al modelo en qué
 * espacio y con qué rol actúa evita respuestas que suenan "genéricas"
 * cuando en realidad el usuario está gestionando un equipo concreto —
 * también incluye la lista de miembros, para poder resolver "asígnaselo a
 * X" (ver `asignadoA` en assistantTools.ts) y para responder con
 * naturalidad a "¿quién hay en este equipo?" sin tener que adivinar. Con
 * rol VIEWER, además avisa explícitamente de que las tools de escritura
 * (crearNota, crearEvento...) van a fallar — sin esto, el modelo las
 * llamaría igual, vería el error, y podría sonar confuso o insistir.
 */
export function buildWorkspaceContextLine(workspace: {
  isPersonal: boolean;
  nombre?: string;
  role?: AssistantWorkspaceRole;
  members?: AssistantWorkspaceMemberInfo[];
}): string {
  if (workspace.isPersonal || !workspace.nombre) return "";
  const roleLabel = workspace.role ? ROLE_LABELS[workspace.role] : "miembro";
  let base = `El usuario está trabajando ahora en el espacio de equipo "${workspace.nombre}" — todo lo que hagas (crear notas, eventos, marcar tareas) se guarda ahí, visible para el resto del equipo, no en su espacio personal. Su rol en este equipo es ${roleLabel}.`;
  if (workspace.members && workspace.members.length > 0) {
    const roster = workspace.members
      .map((m) => (m.isSelf ? `${m.email} (el propio usuario)` : m.email))
      .join(", ");
    base += ` Miembros de este equipo: ${roster}.`;
  }
  if (workspace.role !== "VIEWER") return base;
  return `${base} Su acceso es de SOLO LECTURA: no llames a crearNota, crearEvento, completarTarea, aplazarTarea, asignarTarea, editarEvento ni borrarEvento en este espacio — fallarán. Puedes seguir respondiendo preguntas sobre lo que hay guardado con total normalidad.`;
}

/** Resumen de un evento próximo, ya formateado, para el bloque ambiental. */
export interface AmbientEvento {
  titulo: string;
  fecha: string;
}

/** Cifras del estado actual del workspace activo, para el bloque de contexto "ambiental" (ver resolveAmbientStats en assistantAmbient.ts). */
export interface AmbientStats {
  pendientesCount: number;
  /** Pendientes cuya fecha límite YA pasó — el dato más accionable de todos, y el que el Asistente no tenía. */
  vencidasCount: number;
  eventosProximos: AmbientEvento[];
  eventosProximosCount: number;
}

/**
 * Bloque de contexto "ambiental": no son notas citadas como fuente (eso ya
 * lo cubre buildContextBlock), sino una foto rápida de cuánto hay pendiente
 * y qué se acerca en el calendario — para que el Asistente pueda responder
 * con criterio a preguntas tipo "¿cómo llevo la semana?" sin tener que
 * enumerar cada nota. Pura y testeable sin BD.
 */
export function buildAmbientBlock(stats: AmbientStats): string {
  const partes: string[] = [];
  if (stats.pendientesCount > 0) {
    const plural = stats.pendientesCount !== 1;
    partes.push(
      `Tiene ${stats.pendientesCount} tarea${plural ? "s" : ""}/recordatorio${plural ? "s" : ""} pendiente${plural ? "s" : ""} en el tablero.`,
    );
  }
  // Va justo después del total de pendientes y antes del calendario: si
  // algo se ha pasado de fecha, es lo primero que el Asistente debe poder
  // mencionar cuando le preguntan cómo va la semana.
  if (stats.vencidasCount > 0) {
    const plural = stats.vencidasCount !== 1;
    partes.push(
      `De esas, ${stats.vencidasCount} ${plural ? "ya han pasado" : "ya ha pasado"} su fecha límite (${plural ? "vencidas" : "vencida"}).`,
    );
  }
  if (stats.eventosProximosCount > 0) {
    const listados = stats.eventosProximos.map((e) => `${e.titulo} (${e.fecha})`).join(", ");
    const resto = stats.eventosProximosCount - stats.eventosProximos.length;
    partes.push(
      `Tiene ${stats.eventosProximosCount} evento${stats.eventosProximosCount === 1 ? "" : "s"} en los próximos 7 días: ${listados}${resto > 0 ? ` y ${resto} más` : ""}.`,
    );
  }
  if (partes.length === 0) return "No tiene tareas pendientes ni eventos en los próximos 7 días.";
  return partes.join(" ");
}

/** Un equipo del usuario, ya resumido (ver resolveMisEquipos en assistantTeamContext.ts). */
export interface AssistantTeamLine {
  nombre: string;
  role: AssistantWorkspaceRole;
  miembros: number;
  esElActivo: boolean;
  tareasAbiertas: number;
}

/**
 * Bloque con TODOS los equipos del usuario, no solo el activo — para que el
 * Asistente pueda diferenciarlos al hablar ("en Obrador tienes 3
 * pendientes, en Asesoría ninguna") en vez de decir "el equipo" como si
 * solo existiera uno. Se genera aunque el espacio activo sea el personal:
 * seguir perteneciendo a equipos es cierto igualmente, y es justo cuando
 * más falta hace aclararlo. Pura y testeable sin BD.
 */
export function buildTeamsBlock(equipos: AssistantTeamLine[]): string {
  if (equipos.length === 0) return "";
  return equipos
    .map((e) => {
      const rol = ROLE_LABELS[e.role];
      const activo = e.esElActivo ? " — ES EL QUE TIENE ABIERTO AHORA" : "";
      const trabajo = e.tareasAbiertas === 1 ? "1 tarea abierta" : `${e.tareasAbiertas} tareas abiertas`;
      return `- "${e.nombre}": ${e.miembros} ${e.miembros === 1 ? "persona" : "personas"}, el usuario es ${rol}, ${trabajo}${activo}.`;
    })
    .join("\n");
}

/**
 * Bloque de memoria persistente (ver assistantMemory.ts) — hechos que se
 * recuerdan SIEMPRE, no solo dentro de esta conversación (a diferencia de
 * `contextBlock`, que son notas citadas por relevancia semántica de esta
 * pregunta en concreto). Pura y testeable sin BD.
 */
export function buildMemoryBlock(hechos: string[]): string {
  if (hechos.length === 0) return "";
  return hechos.map((h) => `- ${h}`).join("\n");
}

/** System prompt completo (reglas + fecha actual + contexto). Pura salvo por `now`, que por defecto es "ahora mismo". */
export function buildSystemPrompt(
  contextBlock: string,
  now: Date = new Date(),
  extra?: { workspaceLine?: string; ambientBlock?: string; memoryBlock?: string; teamsBlock?: string },
): string {
  const offset = madridUtcOffset(now);
  const workspaceSection = extra?.workspaceLine ? `\n\n${extra.workspaceLine}` : "";
  const teamsSection = extra?.teamsBlock
    ? `\n\nEquipos a los que pertenece el usuario (para poder distinguirlos al hablar — no los enumeres salvo que venga a cuento):\n${extra.teamsBlock}`
    : "";
  const ambientSection = extra?.ambientBlock ? `\n\nEstado actual (para responder con criterio a preguntas generales sobre cómo va la semana, sin que cuente como fuente citable): ${extra.ambientBlock}` : "";
  const memorySection = extra?.memoryBlock
    ? `\n\nCosas que el usuario te ha pedido recordar siempre (usa recordarPreferencia/olvidarPreferencia para actualizarlas, no las repitas en cada respuesta salvo que sean relevantes para lo que se está hablando):\n${extra.memoryBlock}`
    : "";
  return `${SYSTEM_PROMPT_BASE}

Fecha y hora actuales en España: ${NOW_FORMATTER.format(now)} (desfase respecto a UTC: ${offset}) — usa esto para calcular cualquier fecha relativa ("mañana", "el jueves", "en dos semanas") y para el desfase que le corresponde a fechaInicio/fechaFin en crearEvento.${workspaceSection}${teamsSection}${ambientSection}${memorySection}

Contexto (notas guardadas relevantes para esta pregunta):
${contextBlock}`;
}
