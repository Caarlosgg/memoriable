-- Categorías propias del usuario (Fase 3 del roadmap del bot). Aditiva de
-- principio a fin: tabla nueva + una columna nullable nueva en Message.
-- `Message.categoria` (la fija, de la IA) no se toca para nada — la nueva
-- columna es una etiqueta APARTE, nunca la sustituye. Ninguna fila
-- existente cambia de comportamiento.

-- CreateTable
CREATE TABLE "custom_categories" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "emoji" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "custom_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_categories_userId_idx" ON "custom_categories"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_categories_userId_nombre_key" ON "custom_categories"("userId", "nombre");

-- AddForeignKey
ALTER TABLE "custom_categories" ADD CONSTRAINT "custom_categories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: etiqueta propia opcional en Message, aparte de `categoria`.
ALTER TABLE "messages" ADD COLUMN "customCategoryId" TEXT;

-- CreateIndex
CREATE INDEX "messages_customCategoryId_idx" ON "messages"("customCategoryId");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_customCategoryId_fkey" FOREIGN KEY ("customCategoryId") REFERENCES "custom_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
