-- Fase Equipo: cada usuario ya tenía, sin saberlo, un "espacio personal"
-- implícito (su propio userId). Este esquema lo hace explícito
-- (Workspace + Membership) y permite, además, workspaces de equipo con
-- varios miembros — mismos componentes (Kanban, Calendario, Asistente)
-- sirven para los dos casos, no se duplica nada. Ver
-- prisma\migrations\20260810120000_add_workspace_model para el diseño
-- completo comentado en schema.prisma.

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "personal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("userId","workspaceId")
);

-- CreateIndex
CREATE INDEX "memberships_workspaceId_idx" ON "memberships"("workspaceId");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: workspace personal de cada usuario. Nullable + único: la
-- @unique en el lado de User (no una constraint aparte en Workspace)
-- impide por diseño que una cuenta acabe con dos workspaces personales.
ALTER TABLE "users" ADD COLUMN "personalWorkspaceId" TEXT;
CREATE UNIQUE INDEX "users_personalWorkspaceId_key" ON "users"("personalWorkspaceId");
ALTER TABLE "users" ADD CONSTRAINT "users_personalWorkspaceId_fkey"
  FOREIGN KEY ("personalWorkspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: un workspace personal + membership OWNER/ACTIVE por cada
-- cuenta ya existente. Id determinista ('personal-' || userId) en vez de
-- cuid()/gen_random_uuid(): así el INSERT...SELECT puede enlazar
-- workspace↔membership↔mensajes sin tener que generar y "recordar" un id
-- nuevo por fila. Formato de id EXCLUSIVO de este backfill histórico — el
-- código de la app nunca reconstruye un id así, siempre resuelve el
-- workspace personal vía User.personalWorkspaceId.
INSERT INTO "workspaces" ("id", "nombre", "personal", "createdAt")
  SELECT 'personal-' || "id", 'Personal', true, now() FROM "users";

INSERT INTO "memberships" ("userId", "workspaceId", "role", "status", "joinedAt")
  SELECT "id", 'personal-' || "id", 'OWNER', 'ACTIVE', now() FROM "users";

UPDATE "users" SET "personalWorkspaceId" = 'personal-' || "id";

-- AlterTable: workspace en el que vive cada nota (visibilidad) y a quién
-- se ha asignado. Nullable de forma transitoria — una migración de
-- seguimiento cierra workspaceId a NOT NULL una vez verificado el
-- backfill completo, mismo patrón que usó en su día "messages.userId"
-- (20260804170000_add_users_multitenancy → 20260804190000_require_user_owner).
ALTER TABLE "messages" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "messages" ADD COLUMN "assigneeId" TEXT;
CREATE INDEX "messages_workspaceId_idx" ON "messages"("workspaceId");
CREATE INDEX "messages_assigneeId_idx" ON "messages"("assigneeId");
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_assigneeId_fkey"
  FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "messages" SET "workspaceId" = 'personal-' || "userId";

-- AlterTable: mismo criterio que messages.
ALTER TABLE "eventos" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "eventos" ADD COLUMN "assigneeId" TEXT;
CREATE INDEX "eventos_workspaceId_idx" ON "eventos"("workspaceId");
CREATE INDEX "eventos_assigneeId_idx" ON "eventos"("assigneeId");
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_assigneeId_fkey"
  FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "eventos" SET "workspaceId" = 'personal-' || "userId";

-- Verificación manual antes de la migración de seguimiento (NOT NULL):
--   SELECT count(*) FROM "messages" WHERE "workspaceId" IS NULL;
--   SELECT count(*) FROM "eventos" WHERE "workspaceId" IS NULL;
-- Ambas deben dar 0 antes de aplicar 20260810130000_require_message_workspace.
