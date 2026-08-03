-- Habilita pgvector. Ya viene disponible como extensión en Supabase
-- (no hace falta contactar soporte ni instalar nada); esto solo la activa
-- en esta base de datos concreta.
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable: columna de embedding para búsqueda semántica (Fase 2).
-- Nullable y sin backfill automático aquí a propósito: los mensajes ya
-- existentes se rellenan con un script aparte (ver src/cli/backfillEmbeddings.ts),
-- no bloqueando esta migración ni el flujo normal de guardado.
ALTER TABLE "messages" ADD COLUMN "embedding" vector(768);

-- CreateIndex: HNSW sobre distancia coseno (la métrica que usa la búsqueda
-- semántica). Se elige HNSW en vez del ivfflat por defecto de pgvector
-- porque no necesita re-entrenarse al crecer la tabla (ivfflat sí, con
-- listas fijadas en el momento de crear el índice) y da mejor recall/
-- latencia en el rango de tamaño de esta app. Coste: más lento de construir
-- y algo más pesado en escritura, aceptable aquí.
CREATE INDEX "messages_embedding_hnsw_idx" ON "messages"
  USING hnsw ("embedding" vector_cosine_ops);

-- CreateTable: fusible de coste propio del Asistente conversacional del
-- dashboard (independiente de MAX_MESSAGES_PER_DAY, que es solo del bot).
CREATE TABLE "assistant_budget" (
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "assistant_budget_pkey" PRIMARY KEY ("day")
);
