/**
 * "Visto" de un mensaje propio, calculado a partir de hasta cuándo ha
 * leído cada participante (`lastReadAt`) — sin columna nueva ni tabla de
 * acuses: ese dato ya se guardaba por participante para el contador de no
 * leídos, aquí solo se mira desde el otro lado.
 *
 * Puro a propósito (sin Prisma ni React): es la única parte con reglas de
 * verdad — a quién se cuenta, qué pasa con quien no ha abierto nunca — y
 * así se prueba sola.
 */

export interface ReadReceiptParticipant {
  userId: string;
  lastReadAt: string | null;
}

/**
 * Cuántas OTRAS personas han leído un mensaje enviado en `createdAt`.
 *
 * Se cuenta a quien tenga `lastReadAt >= createdAt`. Quien no ha abierto
 * nunca la conversación (`null`) no cuenta: no es que no lo haya visto
 * "todavía", es que no ha llegado a entrar.
 *
 * El propio autor queda fuera siempre (leer lo que acabas de escribir no
 * es un acuse de nadie), y por eso `autorId` es obligatorio en vez de
 * confiar en que quien llame lo haya filtrado antes.
 */
export function contarVistos(
  participants: readonly ReadReceiptParticipant[],
  autorId: string,
  createdAt: string,
): number {
  const enviado = new Date(createdAt).getTime();
  // Una fecha inválida haría que toda comparación diera `false` y el
  // "Visto" no apareciera nunca sin decir por qué — mejor tratarlo como
  // "no se puede saber" de forma explícita.
  if (Number.isNaN(enviado)) return 0;

  return participants.filter((p) => {
    if (p.userId === autorId) return false;
    if (!p.lastReadAt) return false;
    const leido = new Date(p.lastReadAt).getTime();
    return !Number.isNaN(leido) && leido >= enviado;
  }).length;
}

/**
 * Texto del acuse bajo el último mensaje propio, o `null` si no hay nada
 * que decir todavía (nadie lo ha leído aún).
 *
 * En una conversación de dos, "Visto" a secas es lo que todo el mundo
 * espera; poner "Visto por 1" ahí sonaría a robot. En un grupo el número
 * sí aporta, porque la pregunta real es cuánta gente se ha enterado.
 */
export function textoVisto(
  participants: readonly ReadReceiptParticipant[],
  autorId: string,
  createdAt: string,
  esGrupo: boolean,
): string | null {
  const vistos = contarVistos(participants, autorId, createdAt);
  if (vistos === 0) return null;
  return esGrupo ? `Visto por ${vistos}` : "Visto";
}
