import { verifySession } from "@/lib/dal";
import { getActiveWorkspace } from "@/lib/workspace";
import { PersonalToday } from "./PersonalToday";
import { TeamToday } from "./TeamToday";

const SALUDO_FORMATTER = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" });

function saludoSegunHora(hora: number): string {
  if (hora < 6) return "Buenas noches";
  if (hora < 14) return "Buenos días";
  if (hora < 21) return "Buenas tardes";
  return "Buenas noches";
}

/**
 * Pantalla de inicio: despacha a la vista de SU modo.
 *
 * Antes era una única vista para los dos modos, y por eso "no decía nada" —
 * intentaba servir a la vez a "tu día" y a "el equipo", y una ficha llegaba
 * a mostrar "Tu equipo: 0" estando en personal, un número que no medía
 * nada. Ahora cada modo tiene su propia pantalla (PersonalToday/TeamToday);
 * lo único que comparten es el saludo y el layout de esta cabecera.
 */
export async function TodayView() {
  const userId = await verifySession();
  const { workspaceId, isPersonal, role } = await getActiveWorkspace(userId);
  const ahora = new Date();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{saludoSegunHora(ahora.getHours())}</h1>
        {/* first-letter:uppercase: Intl da el día en minúscula ("lunes, 18 de agosto"). */}
        <p className="text-sm text-muted first-letter:uppercase">{SALUDO_FORMATTER.format(ahora)}</p>
      </div>

      {isPersonal ? (
        <PersonalToday workspaceId={workspaceId} userId={userId} />
      ) : (
        <TeamToday workspaceId={workspaceId} userId={userId} role={role} />
      )}
    </div>
  );
}
