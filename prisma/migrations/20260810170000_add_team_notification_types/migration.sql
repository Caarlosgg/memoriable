-- Rediseño de gestión de equipo: nuevos tipos de notificación para
-- eventos de equipo (añadido, cambio de rol), no solo asignación.
ALTER TYPE "NotificationType" ADD VALUE 'ADDED_TO_TEAM';
ALTER TYPE "NotificationType" ADD VALUE 'ROLE_CHANGED';
