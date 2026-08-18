import { User, Users, type LucideIcon } from "lucide-react";

/**
 * El MODO en el que está la aplicación. No es un dato nuevo: sale de
 * `getActiveWorkspace().isPersonal` (ver lib/workspace.ts), que ya se resuelve
 * una vez por petición. Lo que aporta este módulo es tratarlo como un
 * CONTEXTO con personalidad propia en vez de como un booleano suelto.
 *
 * El porqué: MemorIAble va dirigido a autónomos y negocios pequeños, y esa
 * gente es las dos cosas a la vez — una persona con su vida y un negocio con
 * su equipo. Mezclar ambas en la misma pantalla es justo lo que hacía que la
 * aplicación se sintiera confusa: no sabías si "3 pendientes" eran tuyas o
 * del bar. Al separarlas, cada modo puede enseñar lo que de verdad importa
 * ahí, y cambiar de uno a otro tiene que NOTARSE.
 *
 * Puro y sin dependencias de servidor: lo importan tanto Server Components
 * (para decidir qué pintar) como Client Components (menú, selector).
 */
export type Modo = "personal" | "equipo";

export function modoDe(isPersonal: boolean): Modo {
  return isPersonal ? "personal" : "equipo";
}

export interface ModoPresentation {
  /** Cómo se llama el modo al hablarle al usuario. */
  label: string;
  /** Qué es este espacio, en una línea — para la cabecera del selector. */
  descripcion: string;
  Icon: LucideIcon;
  /**
   * Clase del token de acento del modo. Deliberadamente NO son colores
   * nuevos: el personal usa el verde de siempre (la identidad del producto) y
   * el de equipo el ámbar que ya existe para "resalte". Así el cambio se ve
   * sin inventar paleta ni recomprobar contraste.
   */
  acento: string;
  acentoSoft: string;
  acentoBorde: string;
}

export const MODO_PRESENTATION: Record<Modo, ModoPresentation> = {
  personal: {
    label: "Personal",
    descripcion: "Solo tú lo ves",
    Icon: User,
    acento: "text-accent",
    acentoSoft: "bg-accent-soft",
    acentoBorde: "border-accent",
  },
  equipo: {
    label: "Equipo",
    descripcion: "Compartido con tu equipo",
    Icon: Users,
    acento: "text-highlight-strong",
    acentoSoft: "bg-highlight-soft",
    acentoBorde: "border-highlight",
  },
};
