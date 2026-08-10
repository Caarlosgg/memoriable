-- AlterTable: posición dentro de la columna del tablero kanban (arrastre
-- para reordenar). Columna aditiva, con default — las filas existentes se
-- rellenan a continuación a partir de su fecha (mismo orden que ya tenían
-- por "fecha desc", no se reordena nada visible para nadie).
ALTER TABLE "messages" ADD COLUMN     "orden" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill: orden = fecha en milisegundos, para que las notas ya guardadas
-- mantengan exactamente el mismo orden relativo que tenían hasta ahora.
UPDATE "messages" SET "orden" = EXTRACT(EPOCH FROM "fecha") * 1000;

-- CreateIndex
CREATE INDEX "messages_orden_idx" ON "messages"("orden");
