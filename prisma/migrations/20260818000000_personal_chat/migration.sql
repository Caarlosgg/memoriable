-- Chat personal: DIRECT y los GRUPOS creados a mano pasan a ser SIEMPRE
-- personales (sin workspaceId) — el chat es del usuario, no del equipo
-- activo, así que deja de depender de qué workspace tenga elegido el
-- selector y deja de desaparecer en el espacio personal. Solo el grupo
-- "Equipo" autocreado por workspace sigue llevando workspaceId (ver
-- ensureDefaultGroupConversation, chat/actions.ts).

-- AlterTable: workspaceId pasa a opcional en ambas tablas.
ALTER TABLE "chat_conversations" ALTER COLUMN "workspaceId" DROP NOT NULL;
ALTER TABLE "chat_messages" ALTER COLUMN "workspaceId" DROP NOT NULL;

-- Fusión de duplicados: antes de que "directKey" pase a ser único a nivel
-- GLOBAL (ya no por workspace), dos personas que ya hablaban en varios
-- equipos a la vez tendrían más de una conversación DIRECT con la misma
-- directKey (una por workspace) — se conserva la más antigua y el resto se
-- fusiona en ella, sin perder ningún mensaje.
WITH duplicados AS (
  SELECT "id", "directKey", ROW_NUMBER() OVER (PARTITION BY "directKey" ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "chat_conversations"
  WHERE "type" = 'DIRECT' AND "directKey" IS NOT NULL
)
UPDATE "chat_messages" m
SET "conversationId" = canonico."id"
FROM duplicados dup
JOIN duplicados canonico ON canonico."directKey" = dup."directKey" AND canonico.rn = 1
WHERE dup.rn > 1 AND m."conversationId" = dup."id";

-- Los duplicados ya no tienen mensajes propios (movidos arriba) — borrarlos
-- se lleva también sus participantes (ON DELETE CASCADE, ver
-- 20260817140000_chat_conversations).
WITH duplicados AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "directKey" ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "chat_conversations"
  WHERE "type" = 'DIRECT' AND "directKey" IS NOT NULL
)
DELETE FROM "chat_conversations" WHERE "id" IN (SELECT "id" FROM duplicados WHERE rn > 1);

-- DIRECT (y su rastro denormalizado en chat_messages) deja de pertenecer a
-- ningún workspace.
UPDATE "chat_conversations" SET "workspaceId" = NULL WHERE "type" = 'DIRECT';
UPDATE "chat_messages" SET "workspaceId" = NULL
  WHERE "conversationId" IN (SELECT "id" FROM "chat_conversations" WHERE "type" = 'DIRECT');

-- El índice único pasa de "por workspace" a global: ya no puede haber dos
-- hilos DIRECT con la misma pareja de personas, da igual en qué equipo
-- empezaran a hablar (los GROUP, con directKey siempre NULL, no chocan
-- entre sí — Postgres no compara NULLs como iguales en un índice único).
DROP INDEX "chat_conversations_workspaceId_directKey_key";
CREATE UNIQUE INDEX "chat_conversations_directKey_key" ON "chat_conversations"("directKey");
