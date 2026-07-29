import "server-only";

/**
 * Contraseña de acceso al dashboard. También se usa como clave para firmar
 * la cookie de sesión: si la contraseña cambia, las sesiones ya emitidas
 * dejan de ser válidas, que es el comportamiento deseado al rotarla.
 */
export function requireDashboardPassword(): string {
  const value = process.env.DASHBOARD_PASSWORD;
  if (!value) {
    throw new Error(
      "DASHBOARD_PASSWORD no está definida: configúrala para poder entrar al dashboard.",
    );
  }
  return value;
}
