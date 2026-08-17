import { verifySession } from "@/lib/dal";
import { getOnboardingChecklist } from "@/lib/onboarding";
import { OnboardingChecklistCard } from "./OnboardingChecklistCard";

/**
 * Se autooculta al completar lo esencial (Telegram vinculado + primera nota
 * guardada) — a partir de ahí el producto ya demuestra su valor por sí
 * solo, seguir insistiendo sería ruido. El paso de equipo es opcional y no
 * bloquea el cierre automático. También se cierra si el usuario la ha
 * cerrado a mano en cualquier momento (ver User.onboardingDismissed).
 */
export async function OnboardingChecklist() {
  const userId = await verifySession();
  const { telegramLinked, hasFirstNote, hasTeam, dismissed } = await getOnboardingChecklist(userId);

  if (dismissed || (telegramLinked && hasFirstNote)) return null;

  return <OnboardingChecklistCard telegramLinked={telegramLinked} hasFirstNote={hasFirstNote} hasTeam={hasTeam} />;
}
