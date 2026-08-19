-- Invitaciones de chat: entrar a un GRUPO deja de ser directo y pasa a ser
-- una propuesta que se acepta o se rechaza — espejo del flujo que ya existe
-- para equipos (Membership.status PENDING/ACTIVE). Los hilos DIRECT no
-- cambian: un 1-a-1 sin mensajes no molesta a nadie, la fricción de aceptar
-- solo se justifica en grupos.
--
-- Aditiva de principio a fin: columna nueva con DEFAULT 'ACTIVE' (ninguna
-- fila existente cambia de comportamiento — todo el mundo sigue viendo y
-- escribiendo en sus conversaciones actuales exactamente igual) y un valor
-- de enum nuevo, que no se usa dentro de esta misma migración.

-- CreateEnum
CREATE TYPE "ChatParticipantStatus" AS ENUM ('PENDING', 'ACTIVE');

-- AlterTable
ALTER TABLE "chat_conversation_participants"
  ADD COLUMN "status" "ChatParticipantStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterEnum: nuevo tipo de notificación, accionable (aceptar/rechazar)
-- desde la propia notificación en vez de solo enlazar.
ALTER TYPE "NotificationType" ADD VALUE 'CHAT_INVITE';
