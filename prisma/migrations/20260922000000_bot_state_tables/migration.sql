-- El fusible de coste del bot y la marca de "resumen diario ya enviado hoy"
-- vivían en ficheros locales (.budget.json, .daily-summary.json) — se
-- reinician al desplegar en un host de free tier (Render) con disco
-- efímero o que se duerme por inactividad. Se mueven a la base de datos,
-- mismo patrón que assistant_budget/rate_limit_buckets, para que
-- sobrevivan a un reinicio del proceso.

-- CreateTable
CREATE TABLE "bot_budget_counter" (
    "subject" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bot_budget_counter_pkey" PRIMARY KEY ("subject")
);

-- CreateTable
CREATE TABLE "bot_daily_summary_state" (
    "subject" TEXT NOT NULL,
    "lastSentDay" TEXT NOT NULL,

    CONSTRAINT "bot_daily_summary_state_pkey" PRIMARY KEY ("subject")
);

-- Mismo criterio que el resto de tablas del esquema `public` (ver
-- 20260907160000_enable_rls_all_tables): Prisma conecta con el rol
-- propietario, que omite RLS, así que esto es defensa en profundidad, no
-- algo que la app necesite para funcionar.
ALTER TABLE "public"."bot_budget_counter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."bot_daily_summary_state" ENABLE ROW LEVEL SECURITY;
