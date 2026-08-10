-- Panel de administración global (/admin): distingue a quien puede ver y
-- gestionar TODOS los usuarios/equipos de la aplicación, no solo los
-- suyos. Aditiva: columna nueva con DEFAULT, no toca datos existentes.
-- No concede el flag a nadie por sí sola — el primer superadmin se
-- designa a mano contra la base de datos (ver SETUP.md).
ALTER TABLE "users" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;
