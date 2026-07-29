-- AlterTable: los mensajes existentes quedan como pendientes (false) y los
-- nuevos también, por el DEFAULT. Cambio no destructivo (solo añade columna).
ALTER TABLE "messages" ADD COLUMN "hecho" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex: acelera el filtrado de /pendientes y del resumen diario.
CREATE INDEX "messages_hecho_idx" ON "messages"("hecho");
