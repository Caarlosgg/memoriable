-- Plantillas de campos personalizados por categoría (uso empresarial:
-- toda nota "Cliente" nace ya con Empresa/Presupuesto/Contacto en vez de
-- tener que añadirlos a mano cada vez). Aditiva: tabla nueva, no toca
-- ninguna existente.
CREATE TABLE "campo_templates" (
    "id" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "campos" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "campo_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "campo_templates_workspaceId_idx" ON "campo_templates"("workspaceId");

CREATE UNIQUE INDEX "campo_templates_workspaceId_categoria_key" ON "campo_templates"("workspaceId", "categoria");

ALTER TABLE "campo_templates" ADD CONSTRAINT "campo_templates_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
