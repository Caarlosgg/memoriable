-- AlterTable: fecha límite/recordatorio de una tarea ("aplazar tarea"),
-- distinta de "fecha" (cuándo se creó). Nullable, sin backfill: las notas
-- existentes no tienen fecha límite hasta que alguien la ponga.
ALTER TABLE "messages" ADD COLUMN     "fechaLimite" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "messages_fechaLimite_idx" ON "messages"("fechaLimite");
