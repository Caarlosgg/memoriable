-- CreateTable: cuentas de ahorro (Fase K) — tablas nuevas, no tocan datos existentes.
CREATE TABLE "cuentas_ahorro" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "objetivoCentimos" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "cuentas_ahorro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_ahorro" (
    "id" TEXT NOT NULL,
    "centimos" INTEGER NOT NULL,
    "concepto" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cuentaId" TEXT NOT NULL,

    CONSTRAINT "movimientos_ahorro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cuentas_ahorro_userId_idx" ON "cuentas_ahorro"("userId");

-- CreateIndex
CREATE INDEX "movimientos_ahorro_cuentaId_idx" ON "movimientos_ahorro"("cuentaId");

-- AddForeignKey
ALTER TABLE "cuentas_ahorro" ADD CONSTRAINT "cuentas_ahorro_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_ahorro" ADD CONSTRAINT "movimientos_ahorro_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "cuentas_ahorro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
