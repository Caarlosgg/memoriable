-- CreateTable: conversación del Asistente (Fase 5), agrupa intercambios en
-- un hilo navegable en vez de pregunta-respuesta suelta.
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "conversations_userId_idx" ON "conversations"("userId");

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: los intercambios ya existentes se quedan sin conversación
-- (NULL) — son de antes de que existiera el concepto de hilo, no se les
-- inventa uno.
ALTER TABLE "assistant_exchanges" ADD COLUMN "conversationId" TEXT;
CREATE INDEX "assistant_exchanges_conversationId_idx" ON "assistant_exchanges"("conversationId");

ALTER TABLE "assistant_exchanges" ADD CONSTRAINT "assistant_exchanges_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
