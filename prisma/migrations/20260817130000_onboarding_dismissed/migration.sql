-- AlterTable: cierre manual de la tarjeta de "primeros pasos" en /asistente.
ALTER TABLE "users" ADD COLUMN "onboardingDismissed" BOOLEAN NOT NULL DEFAULT false;
