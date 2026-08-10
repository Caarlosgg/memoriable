# 📊 Dashboard — MemorIAble

Dashboard web del bot de Telegram [MemorIAble](../README.md): consulta,
busca y gestiona tus mensajes categorizados desde el navegador (o
instalado como app en el móvil). Next.js (App Router) + TypeScript +
Tailwind, con su propio despliegue en Vercel, independiente del bot.

## ¿Qué hace?

- **Multiusuario** (Fase 2): cada persona crea su propia cuenta en
  `/registro` (email + contraseña con hash) y ve solo sus propias notas.
  Sesión con cookie firmada (`SESSION_SECRET`). El chat de Telegram se
  vincula a la cuenta desde "Cuenta" en el dashboard, con un código de un
  solo uso (`/vincular <código>` al bot).
- **Navegación** con sidebar colapsable en desktop y barra de pestañas en
  móvil, entre los apartados: Asistente, Buscador, Categorías, Pendientes y
  Cuenta (ver [Navegación](#navegación)).
- **Asistente conversacional** (pantalla de inicio): preguntas en lenguaje
  natural sobre tus notas guardadas, respondidas por Groq en streaming a
  partir de lo que encuentra por similitud semántica, citando de qué notas
  concretas sale la información — nunca inventa si no encuentra nada. Ver
  [Asistente y búsqueda semántica](#asistente-y-búsqueda-semántica).
- **Captura rápida**: un input que pasa por el MISMO pipeline que el bot
  de Telegram (categoriza + resume + genera su embedding + guarda), ver
  [Cómo reutiliza el pipeline del bot](#cómo-reutiliza-el-pipeline-del-bot).
- **Vista principal por categorías**, con skeletons de carga y estados
  vacíos con mensaje útil.
- **Buscador híbrido** (debounce): texto exacto primero, similitud
  semántica como complemento, con filtro por categoría. Highlight del
  término encontrado.
- **Pendientes**: marca tareas/recordatorios como hechos, con contador
  visible.
- **Instalable como PWA** (Add to Home Screen en iPhone, abre a
  pantalla completa).
- **Cada sección tiene su propio estado de error** con botón
  Reintentar: un fallo puntual (p. ej. la búsqueda o el Asistente) no
  rompe el resto.
- **Aviso de sin conexión**, no intrusivo.

No incluye (fuera de alcance, ver [ROADMAP.md](../ROADMAP.md)): más de un
usuario, edición de mensajes ya guardados, imágenes/documentos/adjuntos.

## Cómo reutiliza los datos del bot

El dashboard mantiene su **propia copia** del schema de Prisma en
`dashboard/prisma/schema.prisma` — mismo modelo `Message` y mismo
`datasource` que `prisma/schema.prisma` (la raíz, fuente de verdad para
las migraciones), pero como archivo físico separado, no como un segundo
generador del schema compartido.

Antes había un segundo generador en el schema de la raíz (`output`
apuntando a `dashboard/node_modules/.prisma/client`), pensado para no
duplicar el modelo. Se descartó porque Prisma resuelve `@prisma/client`/
`prisma` recorriendo los directorios **ancestros** del propio
`schema.prisma`, nunca directorios hermanos: ese generador necesitaba
encontrar un `node_modules` en la raíz del repo. En Vercel, con **Root
Directory** fijado a `dashboard`, el `npm install` de la raíz nunca se
ejecuta — no existe ese `node_modules` — así que Prisma intentaba
auto-instalarse a mitad del build (`npm i prisma@... -D --silent`) y esa
instalación anidada fallaba con `Command failed with exit code 1`.

Con el schema copiado dentro de `dashboard/prisma/`, la resolución sube
desde ahí hasta `dashboard/node_modules` — que sí existe siempre, tanto
en local como en Vercel — sin auto-instalar nada. El coste es mantener
sincronizados a mano los dos archivos si cambia el modelo `Message`; dado
que es un modelo pequeño y estable, es un precio razonable a cambio de
un build que no depende de la raíz del repo.

El `postinstall` de este `package.json` corre `prisma generate`
automáticamente al hacer `npm install` (con
`PRISMA_GENERATE_SKIP_AUTOINSTALL=1` como salvaguarda: si algún día algo
rompe la resolución de nuevo, falla con un error claro en vez de intentar
un `npm install` anidado silencioso).

El dashboard **nunca ejecuta migraciones**: eso lo sigue haciendo solo
el bot (`npm run prisma:deploy` en la raíz). Aquí solo se lee y se
actualiza el campo `hecho`.

## Cómo reutiliza el pipeline del bot

La captura rápida (`src/components/CaptureForm.tsx` → server action
`capture` → `src/lib/pipeline.ts`) corre el mismo `processMessage` que usa
el bot: saneado → categorización (Groq, con reserva heurística offline) →
guardado. La lógica en sí vive en `src/lib/botPipeline/`, una copia
sincronizada de `../src/{ai,pipeline,db,logging}/*` — **no** un import
directo del bot. El porqué (choque entre el `moduleResolution: "nodenext"`
del bot y el `"bundler"` de Next.js/Turbopack, que hace que Turbopack no
pueda resolver los imports con sufijo `.js` del bot) y qué archivos hay que
mantener sincronizados si cambia el modelo o la categorización están en
[`src/lib/botPipeline/README.md`](./src/lib/botPipeline/README.md).

Lo único propio del dashboard en `src/lib/pipeline.ts` es la fontanería:
su propio cliente de Groq (`groq-sdk`, ya una dependencia del dashboard) y
su propio repositorio (con su Prisma). Ver
[Variables de entorno](#variables-de-entorno) para `GROQ_API_KEY`.

## Navegación

Sidebar colapsable en desktop (`src/components/nav/Sidebar.tsx`) que en
móvil se convierte en una barra de pestañas fija abajo
(`BottomTabs.tsx`) — con solo 4 destinos, una barra de pestañas se siente
más nativa que un menú hamburguesa, que tiene más sentido con listas
largas. La sección activa se marca con el color de acento, no solo en
negrita. `src/components/nav/navItems.ts` es la única fuente de verdad
de los 4 destinos, compartida por ambos componentes.

El colapso del sidebar es la única animación de Framer Motion del
dashboard (import dinámico vía `next/dynamic`, para no meterlo en el
bundle inicial): es una transición de ancho con física de resorte que
CSS no reproduce bien. Todo lo demás (`fade-in`, transiciones de color,
skeletons) es CSS/Tailwind puro, y respeta `prefers-reduced-motion`.

`/` redirige a `/asistente` (pantalla de inicio). Las rutas viven en
`src/app/(dashboard)/{asistente,buscador,categorias,pendientes}/page.tsx`.

## Asistente y búsqueda semántica

Cada mensaje guardado (bot o captura rápida) genera un embedding con la
API gratuita de Gemini (`gemini-embedding-001`, `GEMINI_API_KEY`) al
guardarse — ver el porqué de las dimensiones/índice HNSW en
`../prisma/schema.prisma`. Sin `GEMINI_API_KEY`, el mensaje se guarda
igual, solo que sin embedding.

- **Buscador** (`src/lib/hybridSearch.ts`): combina la búsqueda de texto
  (ILIKE, la que ya había) con similitud semántica — el texto va
  siempre primero y en su propio orden; lo semántico solo rellena huecos
  hasta el límite, nunca sustituye una coincidencia exacta. Sin
  `GEMINI_API_KEY` (o si Gemini falla), se queda solo con texto — no
  rompe nada.
- **Asistente** (`src/app/api/asistente/route.ts` +
  `src/components/AssistantChat.tsx`): la pregunta se embebe (Gemini),
  se buscan las notas más similares (`src/lib/vectorSearch.ts`, pgvector),
  y esa evidencia + la pregunta se pasan a Groq (`openai/gpt-oss-120b`,
  vía el paquete `ai` + `@ai-sdk/groq` + `@ai-sdk/react`/`useChat`) para
  sintetizar una respuesta en streaming, citando las notas por categoría y
  fecha (nunca por id interno). El system prompt (`src/lib/assistantContext.ts`,
  con tests) prohíbe explícitamente inventar: sin notas relevantes, dice
  que no encuentra nada. Las fuentes usadas viajan como metadata del
  mensaje (`messageMetadata` de la AI SDK) y se muestran como tarjetas
  expandibles bajo la respuesta.
- **Fusible de coste propio** (`ASSISTANT_MAX_QUESTIONS_PER_DAY`,
  `src/lib/assistantBudget.ts`): un contador diario en Postgres (tabla
  `AssistantBudget`) — no en fichero como el del bot
  (`src/cost/budget.ts`), porque el dashboard es serverless y no tiene
  disco persistente entre invocaciones.
- **Historial reciente** (tabla `AssistantExchange`,
  `src/lib/assistantHistory.ts`): cada pregunta+respuesta se guarda al
  terminar el streaming (`onFinish` en la ruta). La página `/asistente`
  carga los últimos 7 días agrupados por día
  (`src/lib/groupExchangesByDay.ts`, con tests) y los muestra en un
  panel desplegable (`AssistantHistoryPanel`); al hacer click en uno se
  vuelve a cargar en el chat. Se purga solo — ver más abajo.

Los mensajes guardados **antes** de configurar `GEMINI_API_KEY` no tienen
embedding retroactivamente: `npm run backfill-embeddings` (en la raíz,
contra el bot) los rellena en un paso aparte.

### Purga del historial (Vercel Cron Job)

El historial del Asistente no se gestiona a mano: `dashboard/vercel.json`
declara un Cron Job que llama semanalmente a
`GET /api/cron/purge-assistant-history`, que borra los intercambios de
más de 7 días (`purgeOldExchanges()` en `assistantHistory.ts`):

```json
{
  "crons": [{ "path": "/api/cron/purge-assistant-history", "schedule": "0 3 * * 0" }]
}
```

`0 3 * * 0` es cron estándar: cada domingo a las 03:00 UTC. Vercel lee
este fichero automáticamente en cada deploy — no hace falta configurar
nada en el panel salvo, opcionalmente, `CRON_SECRET` (ver tabla de
variables de entorno más abajo): si está definida, la ruta exige la
cabecera `Authorization: Bearer <CRON_SECRET>` que Vercel añade solo a
las llamadas que él mismo dispara, así una petición externa a esa URL
no puede disparar la purga. Los Cron Jobs de Vercel están disponibles
también en el plan Hobby (con la limitación de una ejecución diaria por
cron, que aquí no aplica al ser semanal). Se pueden ver las ejecuciones
en el panel del proyecto, pestaña **Cron Jobs**.

## Desarrollo local

```bash
npm install               # también genera el cliente de Prisma (postinstall)
cp .env.example .env.local
# rellena DATABASE_URL (la misma cadena que usa el bot) y SESSION_SECRET
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). El service worker
**no se registra en desarrollo** (interferiría con el hot-reload); para
probarlo de verdad hace falta un build de producción:

```bash
npm run build && npm start
```

### Variables de entorno

| Variable             | Uso                                              | Obligatoria |
| --------------------- | ------------------------------------------------- | ----------- |
| `DATABASE_URL`        | Conexión a PostgreSQL (la misma que usa el bot)    | Sí          |
| `SESSION_SECRET`      | Firma la cookie de sesión (si rota, las sesiones activas dejan de valer). No es la contraseña de nadie: cada usuario tiene la suya, con hash, en la base de datos | Sí |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | Usuario del bot (sin @); habilita el botón "Abrir Telegram y vincular" en Cuenta en vez del `/vincular <código>` manual | No |
| `GROQ_API_KEY`        | API key de Groq: categoriza la captura rápida y sintetiza las respuestas del Asistente | No para captura (cae a offline); el Asistente no tiene alternativa sin ella |
| `GROQ_MODEL`          | Modelo servido por Groq (opcional)                | — (def. `openai/gpt-oss-120b`) |
| `GEMINI_API_KEY`      | API key de Gemini, para el embedding de cada mensaje y de cada pregunta al Asistente | No — sin ella, todo sigue funcionando solo con texto |
| `GEMINI_MODEL`        | Modelo de embeddings a usar (opcional)             | — (def. `gemini-embedding-001`) |
| `ASSISTANT_MAX_QUESTIONS_PER_DAY` | Fusible de coste propio del Asistente (opcional) | — (def. `30`) |
| `CRON_SECRET`         | Protege `/api/cron/purge-assistant-history` de llamadas externas (opcional, recomendada en producción) | No |

No hace falta `DIRECT_URL` aquí: esa variable es solo para migraciones,
y el dashboard no migra.

### Panel de administración (`/admin`)

Gestión global de usuarios y equipos (restablecer contraseñas, verificar
email a mano, eliminar cuentas/equipos) — solo visible para quien tenga
`User.isSuperAdmin = true`. No hay UI para auto-concederse este permiso
la primera vez, a propósito: se designa a mano contra la base de datos,
una sola vez, para la cuenta que vaya a administrar el resto:

```sql
UPDATE users SET "isSuperAdmin" = true WHERE email = 'tu-email@ejemplo.com';
```

A partir de ahí, esa cuenta puede conceder el permiso a otras desde el
propio panel (Usuarios → "Hacer superadmin").

### Comandos

- `npm run dev` — servidor de desarrollo (Turbopack).
- `npm run build` — build de producción.
- `npm start` — arranca el build de producción.
- `npm run lint` — ESLint.
- `npm test` — batería de Vitest (lógica de búsqueda híbrida y
  construcción del contexto del Asistente; mocks, sin llamadas reales).

## Despliegue en Vercel

Este repo tiene el bot en la raíz y el dashboard en `dashboard/`: hay
que decirle a Vercel dónde vive el proyecto de Next.js.

1. En [vercel.com/new](https://vercel.com/new), importa el repositorio.
2. En **Root Directory**, selecciona `dashboard`. Vercel detecta
   Next.js automáticamente (no hace falta tocar el build command).
   No hace falta marcar "Include source files outside of the Root
   Directory": el dashboard es autocontenido (su propia copia del
   schema vive en `dashboard/prisma/`, ver más arriba), así que Vercel
   no necesita nada fuera de `dashboard/` para instalar ni compilar.
3. En **Environment Variables**, añade:
   - `DATABASE_URL` — la misma cadena de conexión que usa el bot
     (pooler de Supavisor, puerto 6543).
   - `SESSION_SECRET` — cualquier cadena larga y aleatoria propia de este
     dashboard (p. ej. `openssl rand -base64 32`). No es la contraseña de
     nadie: cada persona crea la suya en `/registro`.
   - `GROQ_API_KEY` (opcional, pero necesaria para el Asistente) — sin
     ella la captura rápida cae al heurístico offline, y el Asistente
     responde con un aviso de que no está configurado.
   - `GEMINI_API_KEY` (opcional) — para que el Buscador y el Asistente
     usen similitud semántica, no solo texto.
   - `CRON_SECRET` (opcional, recomendada) — un valor aleatorio propio;
     protege la purga semanal del historial del Asistente (ver
     "Asistente y búsqueda semántica" más arriba). Vercel se encarga de
     enviarlo solo en sus propias llamadas al cron, así que basta con
     definirla aquí, sin tocar nada más.
4. Deploy. El `postinstall` genera el cliente de Prisma como parte del
   build; no hace falta ningún paso manual adicional. El Cron Job de
   `vercel.json` (purga semanal del historial del Asistente) se activa
   solo con el deploy — visible en la pestaña **Cron Jobs** del proyecto.

### Instalar en el iPhone

Con el dashboard ya desplegado (HTTPS, que Vercel da por defecto):

1. Abre la URL en Safari.
2. Entra con tu cuenta (o créala en `/registro`).
3. Toca el icono de compartir (⎋) → **Añadir a pantalla de inicio**.

Se abre a pantalla completa, sin la barra de Safari, con su propio
icono.

## Estructura

```
dashboard/
├── prisma/
│   └── schema.prisma       # copia propia (ver "Cómo reutiliza los datos del bot")
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── asistente|buscador|categorias|pendientes/page.tsx  # las 4 secciones
│   │   │   ├── layout.tsx  # verifySession() + Sidebar/BottomTabs/MobileHeader
│   │   │   └── page.tsx    # redirect("/asistente")
│   │   ├── login/          # público
│   │   ├── api/
│   │   │   ├── search/     # Route Handler protegido (JSON, no redirige)
│   │   │   ├── asistente/  # streaming (ai SDK), su propia comprobación de sesión
│   │   │   └── cron/purge-assistant-history/  # Vercel Cron Job (ver vercel.json)
│   │   ├── manifest.ts     # PWA
│   │   ├── icon.tsx, apple-icon.tsx, icons/192|512/  # iconos generados
│   │   └── layout.tsx
│   ├── components/
│   │   ├── nav/            # Sidebar, BottomTabs, MobileHeader, navItems.ts
│   │   ├── AssistantChat.tsx
│   │   ├── AssistantMarkdown.tsx      # render de las respuestas (react-markdown)
│   │   ├── AssistantHistoryPanel.tsx  # historial reciente, agrupado por día
│   │   └── ...             # el resto de secciones + límites de error
│   ├── lib/
│   │   ├── botPipeline/    # copia sincronizada del pipeline del bot (ver su README)
│   │   ├── pipeline.ts     # captureMessage(): fontanería propia (Groq/Gemini + Prisma)
│   │   ├── vectorSearch.ts # findSimilarMessages() (pgvector, $queryRaw)
│   │   ├── hybridSearch.ts # mezcla texto + semántica (con tests)
│   │   ├── assistantContext.ts  # construcción del prompt/fuentes (con tests)
│   │   ├── assistantBudget.ts   # fusible de coste del Asistente (Postgres)
│   │   ├── assistantHistory.ts  # guardar/leer/purgar AssistantExchange (Prisma)
│   │   ├── groupExchangesByDay.ts  # agrupación pura del historial (con tests)
│   │   └── ...             # datos (Prisma), sesión, categorías, etc.
│   └── proxy.ts             # antes "middleware.ts" (Next.js 16 lo renombró)
├── tests/                    # Vitest: hybridSearch, assistantContext, groupExchangesByDay
├── vercel.json               # Cron Job: purga semanal del historial del Asistente
└── public/sw.js              # cachea solo el shell estático, nunca datos
```
