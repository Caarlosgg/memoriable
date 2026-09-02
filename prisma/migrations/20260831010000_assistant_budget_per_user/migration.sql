-- El fusible del Asistente pasa de contador GLOBAL a contador POR USUARIO
-- (Fase G del repaso post-wedge): con clave `day` sola, un solo usuario
-- preguntando mucho agotaba ASSISTANT_MAX_QUESTIONS_PER_DAY para TODOS los
-- demas usuarios del despliegue.
--
-- Las filas existentes son un contador global sin usuario asociado -- no
-- aplican a la nueva forma. Es un contador de cuota DIARIA, no historial:
-- vaciarlo solo reinicia el limite de hoy, sin perder ningun dato de
-- negocio real.
TRUNCATE TABLE "assistant_budget";

ALTER TABLE "assistant_budget" DROP CONSTRAINT "assistant_budget_pkey";
ALTER TABLE "assistant_budget" ADD COLUMN "userId" TEXT NOT NULL;
ALTER TABLE "assistant_budget" ADD CONSTRAINT "assistant_budget_pkey" PRIMARY KEY ("day", "userId");
