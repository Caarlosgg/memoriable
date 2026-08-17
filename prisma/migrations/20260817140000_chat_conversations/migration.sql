-- Fase Mensajería: el chat de equipo pasa de "un único canal por workspace"
-- a varias conversaciones (individuales y grupos), como un gestor tipo
-- WhatsApp. El historial existente no se pierde: cada workspace que ya
-- tenía mensajes de chat recibe una conversación de grupo "Equipo" con
-- todos sus miembros ACTIVOS, y sus mensajes se enlazan ahí.

-- CreateEnum
CREATE TYPE "ChatConversationType" AS ENUM ('DIRECT', 'GROUP');

-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" TEXT NOT NULL,
    "type" "ChatConversationType" NOT NULL,
    "nombre" TEXT,
    "directKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_conversation_participants" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),
    "muted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "chat_conversation_participants_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_conversations_workspaceId_directKey_key" ON "chat_conversations"("workspaceId", "directKey");
CREATE INDEX "chat_conversations_workspaceId_idx" ON "chat_conversations"("workspaceId");
CREATE INDEX "chat_conversation_participants_userId_idx" ON "chat_conversation_participants"("userId");

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_conversation_participants" ADD CONSTRAINT "chat_conversation_participants_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_conversation_participants" ADD CONSTRAINT "chat_conversation_participants_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: una conversación de grupo "Equipo" (id determinista, mismo
-- criterio que 20260810120000_add_workspace_model) por cada workspace que
-- YA tenía mensajes de chat. `createdById`: el OWNER más antiguo del
-- workspace (o, a falta de eso, el miembro más antiguo) — no hay un
-- "creador" real que recordar del canal antiguo, así que se elige uno
-- consistente y válido para la FK.
INSERT INTO "chat_conversations" ("id", "type", "nombre", "createdAt", "workspaceId", "createdById")
  SELECT
    'chat-default-' || w."id",
    'GROUP',
    'Equipo',
    now(),
    w."id",
    (SELECT m."userId" FROM "memberships" m WHERE m."workspaceId" = w."id" ORDER BY (m."role" = 'OWNER') DESC, m."joinedAt" ASC LIMIT 1)
  FROM "workspaces" w
  WHERE EXISTS (SELECT 1 FROM "chat_messages" cm WHERE cm."workspaceId" = w."id");

-- Participantes del grupo "Equipo" recién creado: todos los miembros ACTIVOS
-- de ese workspace en este momento (mismo conjunto que ya podía leer/
-- escribir en el canal único de antes).
INSERT INTO "chat_conversation_participants" ("conversationId", "userId", "joinedAt")
  SELECT 'chat-default-' || m."workspaceId", m."userId", m."joinedAt"
  FROM "memberships" m
  WHERE m."status" = 'ACTIVE'
    AND EXISTS (SELECT 1 FROM "chat_conversations" c WHERE c."id" = 'chat-default-' || m."workspaceId");

-- AlterTable: enlaza cada mensaje existente a la conversación "Equipo" de su workspace.
ALTER TABLE "chat_messages" ADD COLUMN "conversationId" TEXT;
UPDATE "chat_messages" SET "conversationId" = 'chat-default-' || "workspaceId";
ALTER TABLE "chat_messages" ALTER COLUMN "conversationId" SET NOT NULL;
CREATE INDEX "chat_messages_conversationId_createdAt_idx" ON "chat_messages"("conversationId", "createdAt");
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: silenciar/no-leído pasan a ser por conversación (ver
-- ChatConversationParticipant.muted/lastReadAt) — estas dos columnas
-- quedan totalmente sustituidas, sin ningún código que ya las lea.
ALTER TABLE "memberships" DROP COLUMN "chatMuted";
ALTER TABLE "memberships" DROP COLUMN "lastChatReadAt";
