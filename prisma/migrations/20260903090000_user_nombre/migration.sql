-- Nombre para mostrar del usuario.
--
-- Nullable a propósito: las cuentas que ya existen no tienen nombre y no
-- hay forma de inventarlo. Quien lo tenga vacío sigue viéndose por la parte
-- local de su email, igual que hasta ahora (`displayName()` en
-- dashboard/src/lib/format.ts). Cambio puramente aditivo: ninguna consulta
-- existente se rompe.
ALTER TABLE "users" ADD COLUMN "nombre" TEXT;
