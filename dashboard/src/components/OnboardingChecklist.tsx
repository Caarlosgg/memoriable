import { verifySession } from "@/lib/dal";
import { getOnboardingChecklist } from "@/lib/onboarding";
import { OnboardingChecklistCard } from "./OnboardingChecklistCard";
import { AutoRefresh } from "./AutoRefresh";

/**
 * Se autooculta en cuanto hay una primera nota guardada — ese es el momento
 * en que el producto ya ha demostrado su valor, venga la nota de donde
 * venga.
 *
 * Antes exigía ADEMÁS tener Telegram vinculado, y eso convertía la tarjeta
 * en permanente para quien captura desde la web: podía tener 50 notas y
 * seguía viendo "primeros pasos" en cada visita. Telegram acelera la
 * captura, pero no es un requisito para usar MemorIAble, y la interfaz no
 * debe insinuar lo contrario. También se cierra si el usuario la ha cerrado
 * a mano (ver User.onboardingDismissed).
 */
export async function OnboardingChecklist() {
  const userId = await verifySession();
  const { telegramLinked, hasFirstNote, hasTeam, dismissed } = await getOnboardingChecklist(userId);

  if (dismissed || hasFirstNote) return null;

  return (
    <>
      {/* Sondeo SOLO mientras falta la primera nota: es justo cuando alguien
          está mirando esta pantalla en el ordenador mientras escribe al bot
          desde el móvil, y no hay ningún cambio de foco que dispare el
          refresco normal. En cuanto la nota existe, este componente
          desaparece con la tarjeta y el sondeo se apaga solo. */}
      <AutoRefresh intervalMs={8000} />
      <OnboardingChecklistCard telegramLinked={telegramLinked} hasFirstNote={hasFirstNote} hasTeam={hasTeam} />
    </>
  );
}
