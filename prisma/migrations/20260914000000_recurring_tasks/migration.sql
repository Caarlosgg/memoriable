-- Tareas recurrentes: la tool `crearNota` puede repetirse ("cada martes",
-- "cada 3 días"), pero a diferencia de un evento recurrente (que
-- materializa TODAS sus ocurrencias de golpe) solo existe UNA fila "viva"
-- por serie a la vez — al completarse, se genera la siguiente con la fecha
-- desplazada. Ver el comentario completo en prisma/schema.prisma.

-- CreateEnum
CREATE TYPE "Frecuencia" AS ENUM ('DIARIA', 'SEMANAL', 'QUINCENAL', 'MENSUAL');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN "serieId" TEXT;
ALTER TABLE "messages" ADD COLUMN "serieFrecuencia" "Frecuencia";
ALTER TABLE "messages" ADD COLUMN "serieIndice" INTEGER;
ALTER TABLE "messages" ADD COLUMN "serieVeces" INTEGER;
