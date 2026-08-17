-- CreateTable: memoria persistente del Asistente (hechos/preferencias que
-- se recuerdan siempre, distinto del log de turnos que se purga a los 7 días).
CREATE TABLE "assistant_memories" (
    "id" TEXT NOT NULL,
    "hecho" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "assistant_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_memories_userId_workspaceId_idx" ON "assistant_memories"("userId", "workspaceId");

-- AddForeignKey
ALTER TABLE "assistant_memories" ADD CONSTRAINT "assistant_memories_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_memories" ADD CONSTRAINT "assistant_memories_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
