import { Suspense } from "react";
import { Users, Eye } from "lucide-react";
import { verifySession } from "@/lib/dal";
import { getActiveWorkspace } from "@/lib/workspace";

/**
 * "Compartido en: X" — a petición explícita del usuario: cambiar de
 * workspace con el selector no dejaba claro qué estaba pasando ni por
 * qué el contenido cambiaba. Se planta en Notas/Tablero/Calendario (las
 * secciones que sí cambian de alcance al cambiar de workspace) y no
 * pinta nada en el personal — ahí no hace falta aclarar nada, es el
 * comportamiento de toda la vida. Con rol VIEWER, avisa además de que el
 * acceso es de solo lectura ANTES de que alguien intente guardar algo y
 * se encuentre con el error — el servidor sigue siendo quien de verdad
 * lo impide (ver canWrite en lib/workspace.ts), esto es solo el aviso.
 */
async function Badge() {
  const userId = await verifySession();
  // `getActiveWorkspace` ya trae el nombre y está cacheada por petición
  // (el layout la llama antes que nadie), así que en la práctica esto NO
  // añade ninguna consulta. Antes este componente hacía una tercera
  // consulta propia a `workspace` solo para leer el nombre.
  const { isPersonal, role, nombre } = await getActiveWorkspace(userId);
  if (isPersonal || !nombre) return null;

  if (role === "VIEWER") {
    return (
      <p className="-mt-2 flex items-center gap-1.5 text-xs font-medium text-muted">
        <Eye aria-hidden size={13} />
        Compartido en «{nombre}» — acceso de solo lectura, no puedes crear ni editar aquí.
      </p>
    );
  }

  return (
    <p className="-mt-2 flex items-center gap-1.5 text-xs font-medium text-accent-strong">
      <Users aria-hidden size={13} />
      Compartido en «{nombre}» — solo lo ven los miembros de este equipo.
    </p>
  );
}

/**
 * El `<Suspense>` va DENTRO del propio componente, no en cada página que
 * lo usa, a propósito: es un componente `async`, y las cuatro pantallas
 * principales (Inicio, Notas, Tablero, Calendario) lo pintaban suelto,
 * arriba del todo. Eso bloqueaba el HTML de TODA la pantalla —incluidos
 * los skeletons que esas mismas páginas sí tenían bien puestos— hasta que
 * resolvía, por una línea de texto decorativa. Encapsulándolo aquí, la
 * pantalla se pinta ya y esta línea aparece cuando esté, y ninguna página
 * nueva puede volver a reintroducir el bloqueo por olvidarse del Suspense.
 */
export function ActiveWorkspaceBadge() {
  return (
    <Suspense fallback={null}>
      <Badge />
    </Suspense>
  );
}
