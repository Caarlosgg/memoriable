-- CreateTable: cuentas del dashboard (Fase 2, multiusuario). El bot de
-- Telegram resuelve el dueño de un mensaje entrante por telegramChatId,
-- vinculado desde el dashboard con un código corto (linkCode/linkCodeExpiresAt).
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "telegramChatId" BIGINT,
    "linkCode" TEXT,
    "linkCodeExpiresAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_telegramChatId_key" ON "users"("telegramChatId");
CREATE UNIQUE INDEX "users_linkCode_key" ON "users"("linkCode");

-- AlterTable: dueño de la nota. Nullable a propósito — las notas ya
-- existentes nacen sin dueño y quedan invisibles para todo el mundo hasta
-- el backfill manual a la cuenta real que se registre (nunca se inventa un
-- dueño). Una migración de seguimiento cierra la columna a NOT NULL una vez
-- completado ese backfill.
ALTER TABLE "messages" ADD COLUMN "userId" TEXT;
CREATE INDEX "messages_userId_idx" ON "messages"("userId");
ALTER TABLE "messages" ADD CONSTRAINT "messages_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: mismo criterio que messages.userId.
ALTER TABLE "assistant_exchanges" ADD COLUMN "userId" TEXT;
CREATE INDEX "assistant_exchanges_userId_idx" ON "assistant_exchanges"("userId");
ALTER TABLE "assistant_exchanges" ADD CONSTRAINT "assistant_exchanges_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
