-- Rol de solo lectura para workspaces de equipo (uso empresarial: un
-- cliente/stakeholder externo que solo necesita ver el tablero/calendario
-- compartido, sin poder crear/editar/borrar nada). Aditivo: nuevo valor de
-- enum, no toca ninguna fila existente.
ALTER TYPE "WorkspaceRole" ADD VALUE 'VIEWER';
