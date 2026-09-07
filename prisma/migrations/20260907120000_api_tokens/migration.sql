-- Tokens de API personales.
--
-- Lo que faltaba para que MemorIAble sea "tu memoria, de la que tiran tus
-- otras IAs": hasta ahora TODO iba por cookie de sesión, así que nada
-- externo podía integrarse — ni un servidor MCP, ni un script propio.
--
-- Se guarda el HASH, nunca el token: quien vuelque esta tabla no debe poder
-- usar lo que hay dentro, exactamente igual que con las contraseñas.
--
-- Puramente aditivo: tabla nueva, sin tocar ninguna existente.
CREATE TABLE "api_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "prefijo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

-- Único: es por donde se busca al autenticar cada petición.
CREATE UNIQUE INDEX "api_tokens_tokenHash_key" ON "api_tokens"("tokenHash");
CREATE INDEX "api_tokens_userId_idx" ON "api_tokens"("userId");

-- Cascade: borrar la cuenta se lleva sus tokens. Dejar vivo un token de una
-- cuenta que ya no existe sería una credencial huérfana.
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
