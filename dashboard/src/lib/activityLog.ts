import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export interface LogActivityInput {
  workspaceId: string;
  userId: string;
  /** P.ej. "nota_creada", "tarea_asignada", "tarea_completada" — texto libre, ver ActivityLog en schema.prisma. */
  tipo: string;
  entidad: string;
  entidadId?: string;
  detalle?: Record<string, unknown>;
}

/**
 * Registra un evento en el feed de actividad del workspace (Fase Equipo).
 * Best-effort SIEMPRE: quien llama nunca debe fallar por esto — registrar
 * actividad es un extra, no la acción principal (crear/asignar/completar
 * algo debe funcionar igual aunque esto falle).
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        tipo: input.tipo,
        entidad: input.entidad,
        entidadId: input.entidadId,
        detalle: (input.detalle ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error("No se pudo registrar la actividad (no crítico):", err);
  }
}

export interface ActivityLogItem {
  id: string;
  tipo: string;
  entidad: string;
  entidadId: string | null;
  detalle: unknown;
  createdAt: string;
  userEmail: string;
}

const ACTIVITY_LIMIT = 50;

/** Feed cronológico del workspace, más reciente primero — ver /equipo. */
export async function listActivity(workspaceId: string): Promise<ActivityLogItem[]> {
  const rows = await prisma.activityLog.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: ACTIVITY_LIMIT,
    include: { user: { select: { email: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    entidad: r.entidad,
    entidadId: r.entidadId,
    detalle: r.detalle,
    createdAt: r.createdAt.toISOString(),
    userEmail: r.user.email,
  }));
}
