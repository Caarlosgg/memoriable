# 🔭 Roadmap

Esto es un mapa de hacia dónde puede ir el proyecto, no una lista de promesas
ni de fechas. El orden refleja prioridad aproximada; nada aquí está
comprometido hasta que tenga uso real detrás.

## Ahora (fase 1) — completado

- Categorización y resumen de mensajes con Claude, con fusible de coste y
  caída a un categorizador offline si falla la API o no hay clave.
- Persistencia en PostgreSQL vía Prisma.
- Bot de Telegram robusto (reconexión, validación de token, tarjetas
  formateadas en HTML).
- Validación/saneado del contenido entrante, logging estructurado,
  validación de entorno accionable.
- Tests de la lógica de negocio con mocks (sin depender de servicios reales).
- Dockerfile listo para correr de forma persistente.

## Fase 2 — búsqueda semántica

- Activar el campo `embedding` ya preparado (y comentado) en
  `prisma/schema.prisma`, con la extensión [`pgvector`](https://github.com/pgvector/pgvector)
  en PostgreSQL.
- Generar el embedding de cada mensaje al guardarlo.
- Un comando o comando de Telegram para buscar mensajes pasados por
  significado ("¿qué apunté sobre el viaje a Lisboa?"), no solo por
  categoría o fecha.
- Se activará solo cuando haya uso real que lo justifique — no antes.

## Fase 3 — superficie más allá de Telegram

Ideas para cuando el proyecto tenga tracción, sin orden fijo todavía:

- Un dashboard web de solo lectura para explorar y buscar mensajes
  guardados (complementa a Telegram, no lo sustituye).
- Botones inline en Telegram (recategorizar, marcar como hecho, archivar)
  — hoy las respuestas son deliberadamente mensajes simples.
- Categorías configurables por el usuario en vez de la lista fija actual.
- Exportar los mensajes guardados (CSV / JSON).

## Fuera de alcance por ahora

- Sustituir Telegram por otra interfaz.
- Cualquier plan de pago o facturación — el fusible de coste
  (`MAX_MESSAGES_PER_DAY`) es solo protección ante bugs, no un sistema de
  cuotas de producto.
- Multiusuario / multi-tenant — el proyecto asume un único usuario/bot por
  despliegue.

---

¿Tienes una idea que no está aquí? Abre un issue — ver
[CONTRIBUTING.md](./CONTRIBUTING.md).
