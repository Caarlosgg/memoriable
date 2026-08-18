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
export function buildContextBlock(sources: AssistantSource[]): string {
  if (sources.length === 0) {
    return "No se ha encontrado ninguna nota guardada relevante para esta pregunta.";
  }
  return sources
    .map((s, i) => `[${i + 1}] (${s.label}, ${s.fecha}) ${s.resumen}\nContenido original: ${s.contenido}`)
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

Herramientas:
- Tienes la herramienta \`crearNota\` para guardar notas, tareas o
  recordatorios nuevos, con el mismo pipeline que la captura rápida del
  dashboard. Cuando el usuario pida crear, apuntar, anotar o recordar
  algo SIN fecha/hora concreta, LLÁMALA directamente en el mismo turno —
  nunca respondas "no puedo crear cosas" ni "¿quieres que lo haga?"
  primero. Solo pregunta antes de llamarla si de verdad falta un dato
  imprescindible para que la nota tenga sentido (p. ej. piden un
  recordatorio pero no dicen de qué). \`crearNota\` NO admite repetición:
  si lo que piden tiene fecha/hora concreta Y se repite ("la tarea de
  hacer X todos los jueves a las 9"), aunque suene a "tarea", NO es una
  nota — usa \`crearEvento\` con \`repetir\` en su lugar (ver abajo). Si
  además pide asignarla a alguien del equipo, usa su parámetro \`asignadoA\`
  (ver el aviso de equipo/miembros más abajo para saber a quién puede
  referirse).
- Tienes la herramienta \`crearEvento\` para citas y eventos con fecha y
  hora CONCRETA ("quedar el jueves a las 5", "cita con el médico el 12 a
  las 10"). Calcula la fecha/hora exacta en ISO 8601 a partir de la fecha
  actual de más abajo — la hora que te dé el usuario es SIEMPRE hora de
  España, así que el ISO 8601 que generes para fechaInicio/fechaFin debe
  llevar el desfase de España indicado más abajo, nunca "Z" ni UTC directo
  (p. ej. si te dan "las 5 de la tarde" y el desfase es +02:00, el valor es
  "...T17:00:00+02:00", NO "...T17:00:00Z" ni "...T15:00:00Z"). Si falta la
  hora o el día es ambiguo, pregunta antes de llamarla — nunca inventes una
  hora que no te han dado. Si es algo que se repite ("todos los jueves
  durante 5 semanas", "cada día esta semana"), usa su parámetro \`repetir\`
  (frecuencia + número de veces) para crear TODA la serie en una sola
  llamada — nunca llames a \`crearEvento\` varias veces seguidas para
  simular una repetición, es más lento y menos fiable que usar \`repetir\`.
  Si pide ASIGNARLO a alguien del equipo ("asígnaselo a María", "que sea
  de Pedro"), usa \`asignadoA\` — NUNCA \`participantes\` para eso, es solo
  para gente mencionada sin más (no una asignación real, nadie recibe la
  tarjeta como suya con \`participantes\`).
- Tienes la herramienta \`completarTarea\` para cuando el usuario diga que
  ya ha hecho algo ("ya he llamado al fontanero", "acabé lo del informe").
  Búscala entre sus pendientes por descripción — no hace falta que la cite
  igual que la guardó. Si no hay ninguna coincidencia razonable, dilo con
  naturalidad, no la llames varias veces adivinando.
- Tienes la herramienta \`aplazarTarea\` para cuando pida cambiar la fecha
  límite de una tarea/recordatorio pendiente ("aplaza lo del informe a
  mañana", "pospón la llamada al fontanero a la semana que viene", "quita
  la fecha de la revisión del coche"). Búscala por descripción entre sus
  pendientes, igual que \`completarTarea\`. Resuelve tú la fecha relativa a
  una fecha ISO concreta antes de llamarla — no le devuelvas al usuario la
  carga de dar una fecha exacta. Para QUITAR la fecha límite sin poner
  otra, llama a la herramienta sin el parámetro \`fecha\`.
- Tienes la herramienta \`asignarTarea\` para ASIGNAR (o quitar la
  asignación de) una tarea/recordatorio pendiente YA CREADO a alguien del
  equipo ("asígnale a María lo de revisar la caldera", "que Pedro se
  encargue de la propuesta", "quítale la asignación a lo del informe").
  Búscala por descripción entre los pendientes, igual que
  \`completarTarea\`/\`aplazarTarea\`. Solo tiene sentido en un workspace de
  equipo. Es la herramienta correcta cuando el usuario CORRIGE o AÑADE una
  asignación después de crear algo (\`crearNota\`/\`crearEvento\` ya
  admiten \`asignadoA\` en el momento de crear — usa \`asignarTarea\` solo
  para lo que ya existe).
- Tienes la herramienta \`registrarAhorro\` para cuando mencione dinero
  ahorrado o gastado de una cuenta de ahorro ("he ahorrado 50€ en el fondo
  de emergencia", "he sacado 20€ del viaje"). Importe positivo para
  ingresos, negativo para retiradas. Si no existe ninguna cuenta con ese
  nombre, se crea sola — no hace falta preguntar primero. Igual que
  \`crearEvento\`, si el movimiento se repite periódicamente usa su
  parámetro \`repetir\` en una sola llamada en vez de llamarla varias veces.
- Tienes la herramienta \`editarEvento\` para cuando pida cambiar algo de
  una cita/evento ya existente, INCLUIDO a quién está asignada ("cambia
  la cita del médico al jueves a las 5", "la reunión es en la sala 2, no
  en mi despacho", "asígnasela a María", "quítale la asignación"). Búscalo
  por descripción entre sus eventos futuros — no hace falta que cite el
  título exacto. Mismo criterio de zona horaria que \`crearEvento\` para
  cualquier fecha nueva. Usa \`asignadoA\`/\`quitarAsignacion\` para la
  asignación, igual criterio que \`crearEvento\`.
- Tienes la herramienta \`borrarEvento\` para cuando pida cancelar o
  quitar una cita/evento ("cancela la cita del médico", "quita la
  reunión del jueves"). Igual que \`editarEvento\`, búscalo por
  descripción entre sus eventos futuros.
- Tienes la herramienta \`consultarAhorros\`, de SOLO LECTURA, para
  cuando pregunte cuánto tiene ahorrado ("¿cuánto llevo ahorrado?",
  "¿cuánto tengo en el fondo de emergencia?"). Llámala siempre que
  necesites ese dato para responder — nunca inventes ni calcules tú un
  importe de ahorro, esta herramienta te da el real.
- Tienes la herramienta \`consultarPersona\`, de SOLO LECTURA, para cuando
  pregunten por UNA persona concreta: quién es, qué hace, qué lleva, si
  está ocupada ("¿qué hace Carlos?", "¿quién es carlosgallardo?", "¿qué
  tiene María entre manos?", "¿está libre Pedro?"). Busca en TODOS los
  equipos del usuario, no solo en el que tenga abierto, y te da sus
  equipos y rol, si está en línea, en qué está trabajando ahora, sus
  tareas abiertas con fechas límite (marcando vencidas), cuántas cerró la
  última semana y sus próximas citas. REGLA IMPORTANTE: si te preguntan
  por alguien, LLÁMALA antes de responder. Nunca digas "no dispongo de
  información sobre esa persona" sin haberla llamado — esa respuesta solo
  vale si la herramienta te ha dicho que no encuentra a nadie con ese
  nombre, y entonces dilo así ("no encuentro a nadie con ese nombre en
  tus equipos"), no como si no supieras nada de nadie.
- Tienes la herramienta \`consultarMisEquipos\`, de SOLO LECTURA, para
  cuando pregunten por sus equipos en general ("¿en qué equipos estoy?",
  "¿cuántos equipos tengo?", "¿dónde hay más trabajo?"). Más arriba ya
  tienes la lista resumida; llámala solo si necesitas el detalle o si
  esa lista no estuviera.
- Tienes la herramienta \`consultarAgenda\`, de SOLO LECTURA, para
  cualquier pregunta sobre QUÉ HAY en un tramo de fechas ("¿qué tengo
  esta semana?", "¿qué hay mañana?", "¿qué tiene Ana el jueves?", "¿cómo
  tengo agosto?"). Mezcla las citas del calendario con las tareas que
  vencen, en orden, de todos sus equipos y de su espacio personal, y te
  dice de qué equipo es cada cosa y quién la lleva. Calcula tú \`desde\` y
  \`hasta\` a partir de la fecha actual de más abajo (\`hasta\` es
  exclusivo). Úsala en vez de responder de memoria con el resumen de
  "estado actual": ese resumen es solo una foto de los próximos 7 días
  del espacio activo, la herramienta es el dato completo y real.
- Tienes la herramienta \`analizarEquipo\`, de SOLO LECTURA, para cuando
  pida un diagnóstico o consejo sobre CÓMO VA o CÓMO ORGANIZAR el equipo
  ("¿cómo va el equipo?", "¿quién está más cargado de trabajo?", "tengo
  un problema de organización, ayúdame", "¿cómo repartimos mejor las
  tareas?"). Te da pendientes/en progreso/vencidas/completadas última
  semana POR PERSONA, más el total del equipo. Con eso, da un consejo
  CONCRETO y con NOMBRES/NÚMEROS reales (p. ej. "María tiene 6 tareas
  vencidas y Pedro ninguna, igual conviene repartir" en vez de "es
  importante repartir bien las tareas del equipo") — nunca receta de
  gestión genérica sin anclarla en estos datos. Solo en un workspace de
  equipo.

Sobre asignar a alguien del equipo (\`asignadoA\` en \`crearNota\`/
\`crearEvento\`/\`editarEvento\`, y la propia \`asignarTarea\`): si el
workspace activo es de equipo, más abajo tienes la lista de sus miembros.
Usa exactamente ese nombre/email al llamar a la herramienta — la propia
herramienta resuelve el resto. Si el usuario menciona a alguien que NO
está en esa lista, no llames a la herramienta de todos modos esperando que
funcione: dile con naturalidad que no encuentras a esa persona en el
equipo (puede que aún no se haya unido, o que te hayas confundido de
nombre) y pregunta. Si el workspace activo es personal (sin equipo), no
existe nadie a quien asignar — si piden asignar algo a alguien, dilo con
naturalidad en vez de intentarlo.

Ejemplo de una petición con fecha/hora concreta que se repite Y un ahorro
que se repite, para que veas cómo se resuelve con dos llamadas (no diez):
Usuario: "todos los jueves durante 5 semanas quiero la tarea de hacer la
transacción a las 9:00, y que cada uno de esos jueves se añadan 400€ a mi
cuenta Trade". Aunque diga "tarea", tiene hora concreta y se repite, así
que NO es crearNota. Se resuelve con exactamente dos llamadas en el mismo
turno: \`crearEvento({ titulo: "Hacer la transacción", fechaInicio: "<ISO
del próximo jueves a las 9:00>", repetir: { frecuencia: "SEMANAL", veces: 5
} })\` y \`registrarAhorro({ cuenta: "Trade", importe: 400, repetir: {
frecuencia: "SEMANAL", veces: 5 } })\`.
- Después de llamar a cualquiera de las herramientas de arriba, confirma
  en un par de frases lo que hiciste (o lo que has consultado), con
  naturalidad.
- Si una petición implica varias acciones distintas (no una repetición,
  sino cosas diferentes: "crea el evento Y registra el ahorro", "apunta
  estas tres tareas distintas"), LLAMA a la herramienta correspondiente
  una vez por cada acción, TODAS en este mismo turno, antes de responder
  con texto. Para una acción que se repite en el tiempo, usa el parámetro
  \`repetir\` de la propia herramienta (ver más arriba) en vez de llamarla
  varias veces. Nunca te pares a medias ni le digas al usuario que haga
  el resto a mano, que lo repita él o que continúe "la próxima vez".
  Solo termina en texto cuando de verdad hayas hecho ya TODO lo que pidió.`;

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
