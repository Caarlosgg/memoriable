-- CreateTable: historial de intercambios con el Asistente del dashboard.
-- Se purga solo (Cron Job semanal de Vercel, ver dashboard/vercel.json);
-- no hace falta gestionar el tamaño de esta tabla a mano.
CREATE TABLE "assistant_exchanges" (
    "id" TEXT NOT NULL,
    "pregunta" TEXT NOT NULL,
    "respuesta" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_exchanges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: acelera tanto listar el historial reciente como el borrado
-- semanal por antigüedad.
CREATE INDEX "assistant_exchanges_fecha_idx" ON "assistant_exchanges"("fecha");
