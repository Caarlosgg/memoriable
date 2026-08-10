-- Notificaciones en la app (Fase Equipo): de momento solo "te han
-- asignado esto" — lo mínimo para que asignar deje de ser mudo. Sin
-- canal externo (email/push) todavía, solo bandeja dentro de la app.
CREATE TYPE "NotificationType" AS ENUM ('ASSIGNED_MESSAGE', 'ASSIGNED_EVENTO');

CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_userId_read_idx" ON "notifications"("userId", "read");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
