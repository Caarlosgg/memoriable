-- Cuentas corporativas (gestión de equipo): distingue "sin contraseña
-- porque usa Google" de "sin contraseña porque está pendiente de activar
-- una cuenta creada por un owner/admin al añadirte a un equipo".
ALTER TABLE "users" ADD COLUMN "accountPending" BOOLEAN NOT NULL DEFAULT false;
