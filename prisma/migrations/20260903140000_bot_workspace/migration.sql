-- Dónde escribe el bot de Telegram (comando `/espacio`).
--
-- Hasta ahora el bot SIEMPRE guardaba en el workspace personal del dueño
-- del chat: si trabajabas en equipo, todo lo que dictabas caía en tu espacio
-- privado y el equipo no lo veía nunca. El producto se vende como "escribes
-- al bot" y el bot no sabía dónde trabajas.
--
-- Nullable y sin backfill a propósito: null significa "el personal", que es
-- exactamente el comportamiento actual. Ninguna cuenta existente cambia de
-- sitio al aplicar esto.
--
-- ON DELETE SET NULL: borrar un equipo no puede dejar el bot apuntando a un
-- workspace inexistente — vuelve solo al personal.
ALTER TABLE "users" ADD COLUMN "botWorkspaceId" TEXT;

ALTER TABLE "users" ADD CONSTRAINT "users_botWorkspaceId_fkey"
    FOREIGN KEY ("botWorkspaceId") REFERENCES "workspaces"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Sin @unique (a diferencia de personalWorkspaceId): varios usuarios del
-- mismo equipo pueden tener el bot apuntando ahí a la vez.
CREATE INDEX "users_botWorkspaceId_idx" ON "users"("botWorkspaceId");
