-- AlterTable: "en curso ahora" (Fase Equipo) — quién está trabajando
-- activamente en una tarea/recordatorio, distinto de assigneeId (quién la
-- tiene asignada, permanente). Nullable, sin backfill.
ALTER TABLE "messages" ADD COLUMN "enProgresoPorId" TEXT;
ALTER TABLE "messages" ADD COLUMN "enProgresoDesde" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "messages_enProgresoPorId_idx" ON "messages"("enProgresoPorId");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_enProgresoPorId_fkey"
  FOREIGN KEY ("enProgresoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
