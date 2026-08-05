-- AlterTable: etiquetas libres (Fase F/J) — columna aditiva, con default,
-- no toca filas existentes (nacen con array vacío).
ALTER TABLE "messages" ADD COLUMN     "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[];
