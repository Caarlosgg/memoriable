-- AlterTable: campos extra personalizados (Fase E) — columna aditiva, con
-- default, no toca filas existentes (nacen con objeto vacío).
ALTER TABLE "messages" ADD COLUMN     "camposExtra" JSONB NOT NULL DEFAULT '{}';
