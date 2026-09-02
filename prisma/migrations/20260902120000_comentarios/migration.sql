-- Comentarios sobre notas y eventos (Fase 1 del plan "de proyecto a
-- producto"): la comunicacion del equipo pasa a vivir DENTRO del trabajo,
-- sustituyendo al chat interno que se retira del producto.
--
-- Puramente ADITIVA: crea una tabla nueva y no toca ninguna existente. Las
-- tablas del chat (chat_conversations, chat_conversation_participants,
-- chat_messages) NO se borran en esta migracion a proposito -- retirar la
-- funcion del producto y destruir los datos son dos decisiones distintas, y
-- la segunda no es reversible. Si algun dia se confirma que nadie necesita
-- ese historial, se hara en una migracion aparte y explicita.
CREATE TABLE "comentarios" (
    "id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT,
    "eventoId" TEXT,

    CONSTRAINT "comentarios_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "comentarios_messageId_createdAt_idx" ON "comentarios"("messageId", "createdAt");
CREATE INDEX "comentarios_eventoId_createdAt_idx" ON "comentarios"("eventoId", "createdAt");
CREATE INDEX "comentarios_workspaceId_idx" ON "comentarios"("workspaceId");
CREATE INDEX "comentarios_userId_idx" ON "comentarios"("userId");

-- Cascade en las cuatro: un comentario sin autor, sin workspace o sin la
-- nota/evento que comenta no significa nada -- no es dato que valga la pena
-- conservar huerfano.
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_eventoId_fkey"
    FOREIGN KEY ("eventoId") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactamente uno de los dos padres, nunca ambos ni ninguno. Prisma no
-- expresa esto en el esquema, asi que se impone aqui: sin esta restriccion
-- un bug en la Server Action podria crear comentarios huerfanos que no
-- aparecerian en ningun hilo.
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_un_solo_padre"
    CHECK (("messageId" IS NOT NULL AND "eventoId" IS NULL)
        OR ("messageId" IS NULL AND "eventoId" IS NOT NULL));
