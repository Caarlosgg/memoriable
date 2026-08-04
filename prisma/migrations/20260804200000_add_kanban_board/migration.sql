-- CreateEnum: estado y prioridad para el tablero kanban (Fase 3).
CREATE TYPE "EstadoTarea" AS ENUM ('POR_HACER', 'EN_PROGRESO', 'HECHO');
CREATE TYPE "Prioridad" AS ENUM ('BAJA', 'MEDIA', 'ALTA');

-- AlterTable: columnas nuevas con default, aditivas — no tocan filas
-- existentes salvo el backfill explícito de abajo.
ALTER TABLE "messages" ADD COLUMN "estado" "EstadoTarea" NOT NULL DEFAULT 'POR_HACER';
ALTER TABLE "messages" ADD COLUMN "prioridad" "Prioridad" NOT NULL DEFAULT 'MEDIA';

-- Backfill: las tareas/recordatorios ya marcados como hechos nacen en la
-- columna "Hecho" del tablero en vez de en "Por hacer". El resto se queda
-- en el default (POR_HACER) — no hay forma de saber si ya estaban "en
-- progreso", así que no se inventa ese dato.
UPDATE "messages" SET "estado" = 'HECHO' WHERE "hecho" = true;

CREATE INDEX "messages_estado_idx" ON "messages"("estado");
