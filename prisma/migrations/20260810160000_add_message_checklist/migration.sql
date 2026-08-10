-- Checklist/subtareas dentro de una tarea: array [{id, texto, hecho}].
-- Campo propio, no reutiliza camposExtra (otra forma: diccionario nombre
-- -> {tipo, valor}) — mezclar los dos haría que uno pisara al otro.
ALTER TABLE "messages" ADD COLUMN     "checklist" JSONB NOT NULL DEFAULT '[]';
