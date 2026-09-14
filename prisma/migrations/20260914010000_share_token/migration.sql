-- "Compartir": enlace público de solo lectura para una nota. Token largo y
-- aleatorio (no el id de la nota — ver el comentario en prisma/schema.prisma
-- para el porqué). Null = no compartida.

-- AlterTable
ALTER TABLE "messages" ADD COLUMN "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "messages_shareToken_key" ON "messages"("shareToken");
