import "server-only";
import { cache } from "react";
import { prisma } from "./prisma";
import { getPersonalWorkspaceId } from "./workspace";

export interface OnboardingChecklistState {
  telegramLinked: boolean;
  hasFirstNote: boolean;
  hasTeam: boolean;
  dismissed: boolean;
}

/**
 * Estado de "primeros pasos" para un usuario recién llegado — se calcula en
 * vivo a partir de datos reales (nunca un flag "completado" aparte que
 * pudiera desincronizarse): Telegram vinculado, primera nota guardada, y
 * (opcional) equipo creado/unido. Las notas capturadas por Telegram/
 * Asistente SIEMPRE aterrizan en el workspace personal (ver
 * getPersonalWorkspaceId), así que comprobar ahí basta aunque el usuario
 * tenga activo un workspace de equipo. Cacheado por petición, mismo
 * criterio que el resto de lecturas repetidas de lib/workspace.ts.
 */
export const getOnboardingChecklist = cache(async (userId: string): Promise<OnboardingChecklistState> => {
  const personalWorkspaceId = await getPersonalWorkspaceId(userId);

  const [user, firstNote, teamMembership] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { telegramChatId: true, onboardingDismissed: true } }),
    prisma.message.findFirst({ where: { workspaceId: personalWorkspaceId }, select: { id: true } }),
    prisma.membership.findFirst({
      where: { userId, status: "ACTIVE", workspace: { personal: false } },
      select: { userId: true },
    }),
  ]);

  return {
    telegramLinked: user?.telegramChatId != null,
    hasFirstNote: firstNote != null,
    hasTeam: teamMembership != null,
    dismissed: user?.onboardingDismissed ?? false,
  };
});
