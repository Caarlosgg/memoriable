-- AlterTable: login con Google (Fase H) — las cuentas creadas solo por
-- OAuth no tienen contraseña propia. Aditivo: relaja una restricción, no
-- toca ninguna fila existente (todas ya tienen passwordHash).
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable: verificación de email al registrarse — columna aditiva, con
-- default false. Las cuentas ya existentes nacen sin verificar; no bloquea
-- su acceso retroactivamente (el login solo exige verificación para
-- cuentas creadas a partir de ahora, ver login/actions.ts).
ALTER TABLE "users" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: adjuntar imágenes a notas (Fase D) — columna aditiva, con
-- default, no toca filas existentes (nacen con array vacío).
ALTER TABLE "messages" ADD COLUMN     "imagenes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable: token de un solo uso para confirmar el email al registrarse.
CREATE TABLE "verification_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE INDEX "verification_tokens_userId_idx" ON "verification_tokens"("userId");

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
