-- CreateTable: rate limiting distribuido (login/registro), ventana fija.
-- Aditiva — no toca ninguna tabla ni fila existente.
CREATE TABLE "rate_limit_buckets" (
    "bucketKey" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("bucketKey","windowStart")
);

CREATE INDEX "rate_limit_buckets_windowStart_idx" ON "rate_limit_buckets"("windowStart");
