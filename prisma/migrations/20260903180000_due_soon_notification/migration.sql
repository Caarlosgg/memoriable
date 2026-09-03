-- Aviso de "algo tuyo vence pronto".
--
-- El agujero que tapa: clasificar un mensaje como "recordatorio" no
-- producía NINGÚN aviso, nunca. El producto prometía recordarte cosas y no
-- lo hacía — la infraestructura de notificaciones y de push (VAPID) ya
-- estaba montada y sin usar para esto.
--
-- Puramente aditivo: añadir un valor a un enum no invalida ninguna fila
-- existente ni ninguna consulta.
ALTER TYPE "NotificationType" ADD VALUE 'DUE_SOON';
