-- AlterTable: nombres personalizados de las 3 columnas del tablero por workspace.
ALTER TABLE "workspaces" ADD COLUMN "boardLabels" JSONB NOT NULL DEFAULT '{}';
