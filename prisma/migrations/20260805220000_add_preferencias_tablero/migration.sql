-- AlterTable: filtros del tablero kanban recordados por usuario (server-side,
-- no solo localStorage) — columna aditiva, con default, no toca filas
-- existentes (nacen con objeto vacío).
ALTER TABLE "users" ADD COLUMN     "preferenciasTablero" JSONB NOT NULL DEFAULT '{}';
