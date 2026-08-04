-- El backfill manual ya asignó todas las filas huérfanas (userId IS NULL)
-- a la única cuenta registrada — verificado en 0 antes de esta migración.
-- Cierra la columna a NOT NULL: a partir de aquí, toda nota/intercambio
-- tiene dueño real siempre, sin estado transitorio.
ALTER TABLE "messages" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "assistant_exchanges" ALTER COLUMN "userId" SET NOT NULL;

-- La FK se creó con ON DELETE SET NULL (columna opcional en ese momento).
-- Con la columna ya NOT NULL, SET NULL dejaría de ser válido: si algún día
-- se borra un usuario, Postgres fallaría con una violación de NOT NULL en
-- vez de un RESTRICT limpio y esperado. Se recrea con la acción correcta.
ALTER TABLE "messages" DROP CONSTRAINT "messages_userId_fkey";
ALTER TABLE "messages" ADD CONSTRAINT "messages_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assistant_exchanges" DROP CONSTRAINT "assistant_exchanges_userId_fkey";
ALTER TABLE "assistant_exchanges" ADD CONSTRAINT "assistant_exchanges_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
