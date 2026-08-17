-- Revocación de sesiones sin tabla de sesiones: todo JWT de sesión emitido
-- antes de esta marca deja de valer (ver dashboard/src/lib/sessionRevocation.ts).
-- Nullable a propósito: NULL = nunca se ha revocado nada, así que todas las
-- sesiones ya abiertas siguen valiendo y este cambio no echa a nadie.
ALTER TABLE "users" ADD COLUMN "sessionsValidFrom" TIMESTAMP(3);
