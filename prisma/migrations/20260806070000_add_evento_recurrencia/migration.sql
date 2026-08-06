-- CreateEnum
CREATE TYPE "Recurrencia" AS ENUM ('DIARIA', 'SEMANAL', 'QUINCENAL', 'MENSUAL');

-- AlterTable: calendario por periodos/tareas recurrentes — columnas
-- aditivas, ambas nullable, no tocan filas existentes (nacen sin
-- recurrencia, comportamiento idéntico a antes de esta migración).
ALTER TABLE "eventos" ADD COLUMN     "recurrencia" "Recurrencia",
ADD COLUMN     "recurrenciaHasta" TIMESTAMP(3);
