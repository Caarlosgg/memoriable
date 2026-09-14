-- Resumen semanal por correo ("cuánto has guardado, qué vence pronto") —
-- activado por defecto, como cualquier aviso nuevo del producto.
ALTER TABLE "users" ADD COLUMN "weeklyDigestEmail" BOOLEAN NOT NULL DEFAULT true;
