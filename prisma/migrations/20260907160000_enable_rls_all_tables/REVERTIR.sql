-- REVERSIÓN de la migración 20260907160000_enable_rls_all_tables.
--
-- NO se aplica sola: está aquí por si activar RLS rompiera algo en la app,
-- para poder volver atrás en segundos sin tener que escribir el SQL con
-- prisa. Pégalo en el editor SQL de Supabase y ejecútalo.
--
-- No debería hacer falta: Prisma conecta con el rol PROPIETARIO de estas
-- tablas, y en Postgres el propietario omite RLS salvo que se use FORCE ROW
-- LEVEL SECURITY (que la migración NO usa). El síntoma de que hiciera falta
-- sería inconfundible: la app cargando vacía (cero notas, cero tareas) pese
-- a haber datos.

ALTER TABLE "public"."users" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspaces" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."memberships" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."messages" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."eventos" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."comentarios" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."activity_log" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."board_statuses" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."campo_templates" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."custom_categories" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."push_subscriptions" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."rate_limit_buckets" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."verification_tokens" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."password_reset_tokens" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."api_tokens" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."assistant_exchanges" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."assistant_memories" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."assistant_budget" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."conversations" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cuentas_ahorro" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."movimientos_ahorro" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."chat_conversations" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."chat_conversation_participants" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."chat_messages" DISABLE ROW LEVEL SECURITY;
