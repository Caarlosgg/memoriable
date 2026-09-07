-- Activa Row Level Security en todas las tablas de datos del esquema
-- `public`.
--
-- Por qué: Supabase publica automáticamente el esquema `public` a través de
-- su API REST (PostgREST), accesible con la clave anónima del proyecto. Con
-- RLS desactivado, cualquiera que tenga esa clave podría LEER Y ESCRIBIR
-- todas estas tablas — incluidas `users` (con `passwordHash`),
-- `password_reset_tokens`, `verification_tokens` y `api_tokens`. Es decir:
-- robo de cuentas completo.
--
-- Hoy no es explotable: esta app habla con Postgres por conexión directa
-- (Prisma) y NUNCA publica la clave anónima al navegador (comprobado: no hay
-- ninguna variable NEXT_PUBLIC_SUPABASE_* ni ningún uso del cliente de
-- Supabase en todo el repo). Esto es defensa en profundidad: cierra la
-- puerta ANTES de que una futura integración de cliente, o una clave
-- filtrada en una captura de pantalla, la conviertan en un problema real.
--
-- Sin políticas a propósito: no se define ninguna `CREATE POLICY`, así que
-- para PostgREST (roles `anon` y `authenticated`) el resultado es cero filas
-- y cero escrituras — la superficie queda cerrada del todo. La app no se ve
-- afectada porque Prisma conecta con el rol PROPIETARIO de estas tablas, y
-- en Postgres el propietario omite RLS salvo que se use FORCE ROW LEVEL
-- SECURITY (que aquí deliberadamente NO se usa).
--
-- `_prisma_migrations` se deja fuera a propósito: solo contiene nombres y
-- checksums de migraciones (ningún dato de usuario), y no merece la pena
-- arriesgar el propio sistema de migraciones a cambio de eso.

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."eventos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."comentarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."activity_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."board_statuses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."campo_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."custom_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."rate_limit_buckets" ENABLE ROW LEVEL SECURITY;

-- Credenciales y tokens: lo más sensible de todo el esquema.
ALTER TABLE "public"."verification_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."password_reset_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."api_tokens" ENABLE ROW LEVEL SECURITY;

-- Asistente.
ALTER TABLE "public"."assistant_exchanges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."assistant_memories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."assistant_budget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;

-- Ahorros.
ALTER TABLE "public"."cuentas_ahorro" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."movimientos_ahorro" ENABLE ROW LEVEL SECURITY;

-- Chat retirado del producto (ver el plan, Fase 1.1): las tablas siguen
-- existiendo con datos dentro, así que se protegen igual que el resto.
ALTER TABLE "public"."chat_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."chat_conversation_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;
