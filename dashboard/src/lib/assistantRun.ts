import "server-only";
import type { WorkspaceRole } from "@prisma/client";
import { resolveEmbedder } from "./pipeline";
import { findSimilarMessages } from "./vectorSearch";
import {
  toAssistantSources,
  buildContextBlock,
  buildSystemPrompt,
  buildWorkspaceContextLine,
  buildAmbientBlock,
  buildMemoryBlock,
  buildTeamsBlock,
  type AssistantSource,
  type AssistantWorkspaceMemberInfo,
} from "./assistantContext";
import { resolveAmbientStats, resolveWorkspaceNombre, resolveWorkspaceMembers } from "./assistantAmbient";
import { resolveMisEquipos } from "./assistantTeamContext";
import { createAssistantTools, type AssistantTools } from "./assistantTools";
import { listAssistantMemories } from "./assistantMemory";
import { getPersonalWorkspaceId } from "./workspace";

/** Cuántas notas se citan como fuente automática de una respuesta. */
export const SOURCES_PER_ANSWER = 5;

/**
 * Distancia coseno máxima para citar una nota como fuente automática — sin
 * esto, en un workspace con pocas notas el Asistente podía citar 3-4 que no
 * tenían nada que ver, solo por ser "las menos lejanas" de lo que había.
 * Mejor citar de menos que citar ruido; ver `encontrarTareaPendiente` en
 * assistantTools.ts para el umbral (más estricto) de las tools que ACTÚAN.
 */
export const SOURCE_MAX_DISTANCE = 0.6;

export interface PrepararAsistenteParams {
  userId: string;
  /** La pregunta de este turno, ya en texto plano. Vacía = no se buscan fuentes. */
  pregunta: string;
  workspaceId: string;
  isPersonal: boolean;
  role: WorkspaceRole;
  /**
   * Notas ya citadas en turnos anteriores de esta conversación: repetir la
   * misma fuente en cada turno es ruido, si el usuario ya la vio.
   */
  yaCitadas?: Set<string>;
}

export interface AsistentePreparado {
  system: string;
  tools: AssistantTools;
  sources: AssistantSource[];
}

/**
 * Monta todo lo que el Asistente necesita para responder: el system prompt
 * con su contexto (notas relevantes, workspace, equipos, cifras de la
 * semana, memoria) y las herramientas ligadas a este usuario y workspace.
 *
 * Vive aparte de la ruta HTTP a propósito: hay DOS superficies que lo usan
 * —la web (`/api/asistente`, en streaming) y Telegram (`/api/bot/asistente`,
 * de una sola respuesta)— y la lección de `/buscar` fue justamente esa: en
 * cuanto cada superficie monta su propio contexto, la misma pregunta empieza
 * a dar respuestas distintas según por dónde entres. Aquí solo cambia el
 * transporte; el cerebro es el mismo.
 *
 * NINGUNA pieza del contexto es crítica: cada bloque atrapa su propio error
 * y se degrada a vacío. Sin GEMINI_API_KEY no hay fuentes; si la BD falla
 * no hay cifras ni memoria — pero el Asistente responde igual, y lo dice con
 * naturalidad (ver el system prompt).
 */
export async function prepararAsistente({
  userId,
  pregunta,
  workspaceId,
  isPersonal,
  role,
  yaCitadas,
}: PrepararAsistenteParams): Promise<AsistentePreparado> {
  async function resolveSources(): Promise<AssistantSource[]> {
    if (!pregunta) return [];
    try {
      const queryEmbedding = await resolveEmbedder().embedQuery(pregunta);
      if (!queryEmbedding) return [];
      const similar = await findSimilarMessages(workspaceId, queryEmbedding, {
        limit: SOURCES_PER_ANSWER,
        maxDistance: SOURCE_MAX_DISTANCE,
      });
      return toAssistantSources(similar).filter((s) => !yaCitadas?.has(s.id));
    } catch (err) {
      console.error("No se pudieron recuperar notas relevantes (se responde sin fuentes):", err);
      return [];
    }
  }

  // Nombre + miembros del workspace activo, resueltos UNA sola vez y
  // reutilizados tanto para la línea de contexto como para las tools
  // (`asignadoA`, `asignarTarea`) — antes cada tool volvía a consultar
  // `membership.findMany` por su cuenta, una ida y vuelta redundante en las
  // peticiones que ya son las más lentas.
  async function resolveWorkspaceInfo(): Promise<{
    nombre: string | undefined;
    members: AssistantWorkspaceMemberInfo[];
  }> {
    if (isPersonal) return { nombre: undefined, members: [] };
    try {
      const [nombre, members] = await Promise.all([
        resolveWorkspaceNombre(workspaceId),
        resolveWorkspaceMembers(workspaceId, userId),
      ]);
      return { nombre, members };
    } catch (err) {
      console.error("No se pudo resolver el nombre/miembros del workspace activo (se continúa sin ellos):", err);
      return { nombre: undefined, members: [] };
    }
  }

  async function resolveAmbient(): Promise<string> {
    try {
      return buildAmbientBlock(await resolveAmbientStats(workspaceId));
    } catch (err) {
      console.error("No se pudieron calcular las cifras ambientales (se responde sin ellas):", err);
      return "";
    }
  }

  // TODOS los equipos del usuario (no solo el activo), para que el
  // Asistente pueda diferenciarlos al hablar en vez de tratar "el equipo"
  // como si solo hubiera uno.
  async function resolveTeams(): Promise<string> {
    try {
      return buildTeamsBlock(await resolveMisEquipos(userId, workspaceId));
    } catch (err) {
      console.error("No se pudieron cargar los equipos del usuario (se responde sin ellos):", err);
      return "";
    }
  }

  // Para `consultarAgenda`, que mezcla lo de todos los equipos con lo
  // personal. Si falla, se cae al workspace activo: la agenda saldrá sin la
  // parte personal, pero nada se rompe.
  async function resolvePersonalId(): Promise<string> {
    try {
      return await getPersonalWorkspaceId(userId);
    } catch (err) {
      console.error("No se pudo resolver el espacio personal (se usa el activo):", err);
      return workspaceId;
    }
  }

  async function resolveMemory(): Promise<string> {
    try {
      const memories = await listAssistantMemories(userId, workspaceId);
      return buildMemoryBlock(memories.map((m) => m.hecho));
    } catch (err) {
      console.error("No se pudo cargar la memoria del Asistente (se responde sin ella):", err);
      return "";
    }
  }

  // Independientes entre sí — en paralelo en vez de en secuencia recorta el
  // tiempo hasta el primer token. Cada una atrapa sus propios errores, así
  // que Promise.all nunca rechaza por un fallo aislado.
  const [sources, workspaceInfo, ambientBlock, memoryBlock, teamsBlock, personalWorkspaceId] =
    await Promise.all([
      resolveSources(),
      resolveWorkspaceInfo(),
      resolveAmbient(),
      resolveMemory(),
      resolveTeams(),
      resolvePersonalId(),
    ]);

  const { members } = workspaceInfo;
  const workspaceLine = buildWorkspaceContextLine({
    isPersonal,
    nombre: workspaceInfo.nombre,
    role,
    members,
  });

  return {
    system: buildSystemPrompt(buildContextBlock(sources), new Date(), {
      workspaceLine,
      ambientBlock,
      memoryBlock,
      teamsBlock,
    }),
    tools: createAssistantTools(userId, workspaceId, role, members, personalWorkspaceId),
    sources,
  };
}
