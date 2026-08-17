-- CreateEnum
CREATE TYPE "MemberPresence" AS ENUM ('DISPONIBLE', 'OCUPADO', 'FUERA');

-- AlterTable: estado manual + última actividad (Fase Equipo: presencia).
ALTER TABLE "memberships" ADD COLUMN "presenceStatus" "MemberPresence";
ALTER TABLE "memberships" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

-- AlterTable: imagen adjunta opcional en un mensaje de chat.
ALTER TABLE "chat_messages" ADD COLUMN "imagenUrl" TEXT;
