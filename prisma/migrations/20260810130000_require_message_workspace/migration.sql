-- El backfill de 20260810120000_add_workspace_model ya asignó workspaceId a
-- toda fila existente (verificado en 0 huérfanos), y todo el código que
-- crea mensajes/eventos desde entonces (bot, captura del dashboard,
-- Asistente, /calendario) ya escribe workspaceId siempre. Cierra la
-- columna a NOT NULL: a partir de aquí, toda nota/evento vive siempre en
-- un workspace real, sin estado transitorio.
ALTER TABLE "messages" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "eventos" ALTER COLUMN "workspaceId" SET NOT NULL;

-- La FK se creó con ON DELETE SET NULL (columna opcional en ese momento).
-- Con la columna ya NOT NULL, SET NULL dejaría de ser válido: si algún día
-- se borra un workspace, Postgres fallaría con una violación de NOT NULL en
-- vez de un RESTRICT limpio y esperado. Se recrea con la acción correcta.
ALTER TABLE "messages" DROP CONSTRAINT "messages_workspaceId_fkey";
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "eventos" DROP CONSTRAINT "eventos_workspaceId_fkey";
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
