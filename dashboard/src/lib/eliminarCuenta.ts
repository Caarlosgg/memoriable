import "server-only";
import { prisma } from "./prisma";

export interface EliminarCuentaResult {
  error?: string;
}

/**
 * Elimina una cuenta entera: su espacio personal (notas, eventos, ahorros,
 * historial del Asistente — todo exclusivamente suyo) y la fila de usuario.
 *
 * Vive aquí y no dentro de una Server Action porque hay DOS caminos que
 * borran una cuenta —el panel de administración y el propio usuario desde
 * "Cuenta" (RGPD)— y tener dos implementaciones de un borrado en cascada
 * es pedir que se separen: bastaría con añadir una tabla nueva y acordarse
 * de un solo sitio para dejar filas huérfanas o, peor, borrar de más.
 *
 * Se niega (sin borrar NADA) en dos casos, ambos para no arrastrar consigo
 * el contenido o el equipo de otras personas:
 *
 * - Es la única persona propietaria de algún equipo. Un equipo sin
 *   propietario no lo puede administrar nadie: hay que pasar la propiedad
 *   o eliminar el equipo antes.
 * - Tiene notas o eventos creados dentro de un equipo compartido. Esas
 *   filas siguen siendo relevantes para el resto del equipo, y borrarlas
 *   por un lado o dejarlas sin autor por otro son decisiones que le
 *   corresponden a quien se va, no a esta función.
 *
 * En los dos casos el mensaje dice QUÉ hacer para desbloquearlo: no es una
 * negativa, es un paso previo.
 */
export async function eliminarCuenta(userId: string): Promise<EliminarCuentaResult> {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { personalWorkspaceId: true },
  });
  if (!target) return { error: "No se ha encontrado esa cuenta." };

  const propiedades = await prisma.membership.findMany({
    where: { userId, role: "OWNER", status: "ACTIVE", workspace: { personal: false } },
    select: { workspaceId: true, workspace: { select: { nombre: true } } },
  });
  for (const membership of propiedades) {
    const otrosDuenos = await prisma.membership.count({
      where: {
        workspaceId: membership.workspaceId,
        role: "OWNER",
        status: "ACTIVE",
        userId: { not: userId },
      },
    });
    if (otrosDuenos === 0) {
      return {
        error: `Eres la única persona propietaria del equipo "${membership.workspace.nombre}". Pasa la propiedad a alguien o elimina el equipo antes de borrar la cuenta.`,
      };
    }
  }

  // `workspaceId: { not: personal }` — lo que vive fuera del espacio
  // personal es, por definición, contenido de un equipo.
  const fueraDelPersonal = { userId, workspaceId: { not: target.personalWorkspaceId ?? "" } };
  const [notasCompartidas, eventosCompartidos] = await Promise.all([
    prisma.message.count({ where: fueraDelPersonal }),
    prisma.evento.count({ where: fueraDelPersonal }),
  ]);
  if (notasCompartidas + eventosCompartidos > 0) {
    return {
      error:
        "Tienes notas o eventos creados dentro de un equipo compartido. Bórralos o pide que los reasignen antes de eliminar la cuenta.",
    };
  }

  // En una transacción: o se borra todo o no se borra nada. Una cuenta a
  // medio borrar (sin notas pero con usuario, o al revés) es peor que
  // cualquiera de los dos estados completos.
  await prisma.$transaction([
    prisma.assistantExchange.deleteMany({ where: { userId } }),
    prisma.conversation.deleteMany({ where: { userId } }),
    prisma.cuentaAhorro.deleteMany({ where: { userId } }),
    prisma.message.deleteMany({ where: { userId } }),
    prisma.evento.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
    // El workspace personal va DESPUÉS del usuario: mientras exista la fila
    // de usuario, su `personalWorkspaceId` lo referencia.
    ...(target.personalWorkspaceId
      ? [prisma.workspace.delete({ where: { id: target.personalWorkspaceId } })]
      : []),
  ]);

  return {};
}
