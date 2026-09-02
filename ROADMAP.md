# 🔭 Roadmap

Esto es un mapa de hacia dónde puede ir el proyecto, no una lista de promesas
ni de fechas. El orden refleja prioridad aproximada; nada aquí está
comprometido hasta que tenga uso real detrás.

## Ahora (fase 1) — completado

- Categorización y resumen de mensajes con Groq (`openai/gpt-oss-120b`), con
  fusible de coste y caída a un categorizador offline si falla la API o no
  hay clave.
- Persistencia en PostgreSQL vía Prisma.
- Bot de Telegram robusto (reconexión, validación de token, tarjetas
  formateadas en HTML).
- Validación/saneado del contenido entrante, logging estructurado,
  validación de entorno accionable.
- Tests de la lógica de negocio con mocks (sin depender de servicios reales).
- Dockerfile listo para correr de forma persistente.
- Dashboard web (Next.js) en `dashboard/`, con despliegue propio en Vercel:
  login, vista por categorías, búsqueda en tiempo real, marcar pendientes
  como hechos y captura rápida (mismo pipeline de categorización que el bot).

## Fase 2 — búsqueda semántica y Asistente — completado

- Embedding de cada mensaje (`gemini-embedding-001`, API gratuita de
  Gemini) al guardarlo, tanto desde el bot como desde la captura rápida
  del dashboard. Backfill aparte (`npm run backfill-embeddings`) para los
  mensajes que ya existían antes de esto.
- Índice HNSW sobre la columna `embedding` (pgvector) para que la
  búsqueda por similitud siga siendo rápida al crecer el volumen de datos.
- Búsqueda híbrida en el Buscador del dashboard: texto exacto (el que ya
  había) primero, semántica solo como complemento — nunca al revés — más
  filtro por categoría.
- Asistente conversacional en el dashboard (pantalla de inicio): escribes
  una pregunta en lenguaje natural, busca por similitud entre tus notas y
  Groq sintetiza una respuesta citando de dónde sale cada cosa — con
  fuentes expandibles bajo la respuesta y su propio fusible de coste
  diario, independiente del del bot.

## Fase 3 — superficie más allá de Telegram — completado

- Edición y recategorización de mensajes ya guardados, tanto desde el
  dashboard (`MessageDetailDialog`) como con botones inline en el propio
  Telegram (marcar hecho, recategorizar entre las 6 categorías fijas o
  entre las propias del usuario).
- Categorías configurables por el usuario, a mayores de las 6 fijas
  (se crean desde "Cuenta" en el dashboard, se asignan desde ambos sitios).
- Exportar los mensajes guardados: Markdown/Obsidian (un `.md` por nota,
  con front matter) y CSV/JSON.

## El producto, y lo que quedó fuera de él

El bucle que define MemorIAble: **capturas** donde estés (Telegram, web,
voz) → **la IA organiza sola** → **recuperas** (búsqueda híbrida +
Asistente que cita sus fuentes) → **actúas** (tareas, calendario) — y todo
en tu propio servidor.

Alrededor de ese núcleo, el dashboard tiene:

- **Equipos**: workspaces compartidos, roles, invitaciones.
- **Tablero** (`/pendientes`): vista kanban de tus tareas/recordatorios,
  con columnas personalizables.
- **Calendario**: vista de eventos y tareas con fecha.
- **Comentarios** sobre cada nota o tarea, con menciones `@` que avisan.
- Notificaciones push, login con Google, instalación como PWA.

### Lo que se retiró del producto, y por qué

- **Chat interno** (mensajería entre usuarios): la intención —comunicación
  del equipo— era buena, pero la forma competía de frente con WhatsApp y
  Telegram, donde el equipo ya está. Sustituido por **comentarios en
  contexto**: comentar *sobre la tarea* llega con su contexto puesto, que
  es justo lo que un mensaje suelto en un hilo pierde. Mismo criterio que
  Notion, Linear o Asana, que tampoco envían un mensajero aparte. El código
  vive en la rama `archive/chat`.
- **Ahorros** (cuentas y movimientos): no encaja en "la memoria de trabajo
  de tu equipo". La ruta, el código y los datos siguen intactos — solo sale
  de la navegación y del Asistente.

## Fuera de alcance por ahora

- Sustituir Telegram por otra interfaz de captura.
- Cualquier plan de pago o facturación — el fusible de coste
  (`MAX_MESSAGES_PER_DAY`) es solo protección ante bugs, no un sistema de
  cuotas de producto.
- Imágenes, documentos o adjuntos (p. ej. fotos de documentos de
  identidad o tarjetas): fuera de alcance por completo por ahora — antes
  de tocar nada de esto hace falta una conversación aparte sobre cómo
  cifrarlo bien.

---

¿Tienes una idea que no está aquí? Abre un issue — ver
[CONTRIBUTING.md](./CONTRIBUTING.md).
