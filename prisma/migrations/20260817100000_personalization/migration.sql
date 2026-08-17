-- AlterTable: preferencias de notificación por tipo (mapa, ausente = todo activado).
ALTER TABLE "users" ADD COLUMN "notificationPrefs" JSONB NOT NULL DEFAULT '{}';

-- AlterTable: silenciar el chat + ocultar categorías, por miembro (no por workspace).
ALTER TABLE "memberships" ADD COLUMN "chatMuted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "memberships" ADD COLUMN "hiddenCategories" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable: registro de actividad del workspace.
CREATE TABLE "activity_log" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "detalle" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_log_workspaceId_createdAt_idx" ON "activity_log"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
