-- CreateTable: eventos del calendario (Fase I) — tabla nueva, no toca datos existentes.
CREATE TABLE "eventos" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3),
    "ubicacion" TEXT,
    "participantes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "messageId" TEXT,

    CONSTRAINT "eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eventos_userId_idx" ON "eventos"("userId");

-- CreateIndex
CREATE INDEX "eventos_fechaInicio_idx" ON "eventos"("fechaInicio");

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
