import "server-only";

/**
 * Clave para firmar la cookie de sesión (JWT). No es la contraseña de
 * nadie — solo protege la firma. Si cambia, todas las sesiones ya emitidas
 * dejan de ser válidas (comportamiento deseado al rotarla).
 */
export function requireSessionSecret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error(
      "SESSION_SECRET no está definida: configúrala (cualquier cadena larga y aleatoria) para poder entrar al dashboard.",
    );
  }
  return value;
}
