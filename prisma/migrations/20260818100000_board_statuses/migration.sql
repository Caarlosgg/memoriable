-- Columnas propias del tablero por workspace ("En diseño", "En revisión",
-- "Esperando al cliente"...). Tres columnas fijas no dan para un obrador,
-- una asesoría y un estudio de diseño a la vez.
--
-- ADITIVA de principio a fin: una tabla nueva y una columna nueva NULLABLE.
-- No reescribe ni una fila existente, y no toca `messages.estado` — que
-- sigue siendo la verdad semántica (abierta/en curso/hecha) también con
-- columnas propias, para que las cifras de inicio, las herramientas del
-- Asistente y los avisos no tengan que saber que esto existe.
--
-- Un workspace sin filas aquí se comporta EXACTAMENTE igual que antes.

-- CreateTable
CREATE TABLE "board_statuses" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    -- Fase del ciclo a la que equivale la columna: es lo que deja que el
    -- resto de la aplicación siga leyendo solo `messages.estado`.
    "fase" "EstadoTarea" NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "board_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "board_statuses_workspaceId_orden_idx" ON "board_statuses"("workspaceId", "orden");

-- AddForeignKey
ALTER TABLE "board_statuses" ADD CONSTRAINT "board_statuses_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: en qué columna propia está cada tarjeta. NULL = en la columna
-- por defecto que corresponda a su `estado`, que es como están hoy todas.
ALTER TABLE "messages" ADD COLUMN "boardStatusId" TEXT;

-- CreateIndex: para vaciar/contar una columna concreta sin recorrer la tabla.
CREATE INDEX "messages_boardStatusId_idx" ON "messages"("boardStatusId");

-- AddForeignKey: ON DELETE SET NULL — al borrar una columna, sus tarjetas
-- NO se borran: vuelven a la columna por defecto de su fase. Borrar una
-- columna nunca debe poder perder trabajo.
ALTER TABLE "messages" ADD CONSTRAINT "messages_boardStatusId_fkey"
  FOREIGN KEY ("boardStatusId") REFERENCES "board_statuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
