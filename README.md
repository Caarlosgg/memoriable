# 🤖 Clasificador de mensajes de Telegram con Claude

## ¿Qué es esto?

Le hablas a un bot de Telegram — una idea, una tarea, una pregunta, un
recordatorio — y él solo lo lee, decide de qué tipo de mensaje se trata y te
devuelve un resumen corto. Todo queda guardado, así que nada de lo que le
cuentes se pierde. Es como un cuaderno de notas al que le escribes por
Telegram y que se organiza solo.

Por dentro usa la IA de Anthropic (Claude) para leer y clasificar cada
mensaje, y una base de datos (PostgreSQL) para guardarlos. No hace falta saber
programar para usarlo — solo seguir [SETUP.md](./SETUP.md) para levantarlo en
unos minutos. El resto de este documento es la parte técnica, para quien vaya
a tocar o entender el código.

---

## Para quien va a tocar el código

Bot de Telegram que **recibe mensajes**, los **categoriza** y **resume** con la
API de Anthropic (Claude), y los **persiste** en PostgreSQL mediante Prisma.

Está diseñado para ser **modular y desacoplado**: si falta alguna variable de
entorno (token de Telegram, cadena de base de datos o API key de Anthropic), ese
módulo concreto no arranca, pero **el resto del sistema se sigue pudiendo
ejecutar y probar** — incluido un pipeline de simulación de extremo a extremo.

---

## ✨ Características

- **Categorización + resumen** de cada mensaje vía Claude (`claude-haiku-4-5`
  por defecto: el modelo más barato que resuelve bien clasificar/resumir un
  mensaje corto).
- **Persistencia** en PostgreSQL con Prisma (esquema tipado y migraciones).
- **Comandos de consulta**: `/buscar <texto>` (coincidencia de texto sobre
  contenido y resumen) y `/pendientes` (tareas y recordatorios sin hacer),
  con el menú publicado en Telegram vía `setMyCommands`.
- **Resumen diario proactivo** (node-cron): a la hora configurable
  (`DAILY_SUMMARY_HOUR`) envía los pendientes y lo guardado el día anterior;
  idempotente ante reinicios del proceso.
- **Bot de Telegram** con Telegraf en modo *polling*, con reconexión automática
  ante caídas y logs claros si el token es inválido. Cada respuesta se
  presenta como una tarjeta HTML (`formatResponseCard()`): categoría en
  negrita con emoji temático, resumen y fecha legible.
- **CLI de simulación** para probar el pipeline completo sin Telegram ni base de
  datos reales.
- **Categorizador offline** (heurístico) de reserva: si no hay API key, si la
  API de Anthropic falla o se agota el fusible de coste, el pipeline sigue
  funcionando sin salir a la red.
- **Resiliencia ante fallos de la API**: timeout, reintentos con backoff
  exponencial ante errores transitorios (rate limits, 5xx) y caída automática
  al categorizador offline — un fallo de la API nunca tira el proceso.
- **Fusible de coste** (`MAX_MESSAGES_PER_DAY`): protege ante bugs en bucle o
  uso inesperado mientras no hay presupuesto detrás. El contador persiste en
  disco para sobrevivir a reinicios.
- **Validación y saneado del contenido entrante**: mensajes vacíos, gigantes o
  con caracteres de control no rompen el pipeline ni corrompen lo guardado.
- **Logging estructurado** (JSON, con timestamp y contexto) en vez de
  `console.log` suelto.
- **Validación de entorno accionable**: si falta una variable requerida, el
  error dice exactamente qué falta y cómo conseguirla.
- **Tests con Vitest** y mocks; la lógica de negocio está cubierta, incluyendo
  los casos límite anteriores.
- **Desacoplamiento por inyección de dependencias**: la lógica no conoce
  Telegram, Prisma ni la SDK de Anthropic directamente.
- **Dockerfile multi-stage** listo para correr de forma persistente (ver
  [Docker](#-docker)).

---

## 🏗️ Arquitectura

```
                 ┌──────────────┐        ┌───────────────┐
 Telegram ──────▶│  bot.ts      │        │ simulate.ts   │◀── CLI
 (Telegraf)      │ (Telegraf)   │        │ (línea de     │
                 └──────┬───────┘        │  comandos)    │
                        │                └──────┬────────┘
                        ▼                       ▼
                 ┌───────────────────────────────────┐
                 │        processMessage()           │  ← núcleo (pipeline)
                 │   depende de INTERFACES, no de     │
                 │   implementaciones concretas       │
                 └───────┬───────────────────┬────────┘
                         ▼                   ▼
              ┌────────────────────┐  ┌────────────────────┐
              │  Categorizer       │  │ MessageRepository  │
              ├────────────────────┤  ├────────────────────┤
              │ AnthropicCategorizer│  │ PrismaRepository   │  ← servicios reales
              │ OfflineCategorizer │  │ InMemoryRepository │  ← para tests/simular
              └────────────────────┘  └────────────────────┘
```

Cada colaborador (categorizador y repositorio) se **inyecta** en el pipeline.
La *fábrica* (`src/pipeline/factory.ts`) elige la implementación según el
entorno:

| Variable presente        | Implementación usada          |
| ------------------------ | ----------------------------- |
| `ANTHROPIC_API_KEY`      | `AnthropicCategorizer` (Claude), envuelto en fusible + resiliencia |
| *(sin API key)*          | `OfflineCategorizer` (heurístico) |
| `DATABASE_URL`           | `PrismaMessageRepository`     |
| *(sin `DATABASE_URL`)*   | `InMemoryMessageRepository`   |

Cuando hay API key, el categorizador queda envuelto en capas de protección
(de fuera a dentro):

```
BudgetedCategorizer   → corta el gasto si se agota MAX_MESSAGES_PER_DAY
  └─ ResilientCategorizer → timeout + reintentos con backoff exponencial
       └─ AnthropicCategorizer → llamada real a Claude
```

Ambas capas caen al `OfflineCategorizer` ante cualquier fallo, así que el
pipeline **siempre** devuelve una categorización.

---

## 📦 Requisitos

- **Node.js ≥ 20** (ver `.nvmrc`).
- Para persistencia real: una base de datos **PostgreSQL**.
- Para el bot: un **token de Telegram** (de [@BotFather](https://t.me/BotFather)).
- Para categorización real: una **API key de Anthropic**.

> Nada de esto es necesario para ejecutar los tests o la simulación offline.

---

## 🚀 Puesta en marcha

> ¿Primera vez? Sigue **[SETUP.md](./SETUP.md)** — guía paso a paso de 5
> minutos, sin necesidad de pensar. Lo de abajo es el resumen técnico.

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# …y rellena los valores en .env

# 3. (Opcional, para persistencia real) generar el cliente de Prisma y migrar
npm run prisma:generate
npm run prisma:deploy
```

### Variables de entorno

| Variable               | Descripción                                              | Obligatoria para     |
| ----------------------- | -------------------------------------------------------- | --------------------- |
| `DATABASE_URL`          | Conexión PostgreSQL del runtime (pooler, 6543, transacción) | Persistencia real   |
| `DIRECT_URL`            | Conexión directa para migraciones (pooler, 5432, sesión)  | `prisma migrate/deploy` |
| `TELEGRAM_BOT_TOKEN`    | Token del bot de Telegram                                 | Arrancar el bot       |
| `ANTHROPIC_API_KEY`     | API key de Claude                                         | Categorización real   |
| `ANTHROPIC_MODEL`       | Modelo de Claude (opcional)                               | — (def. `claude-haiku-4-5`) |
| `MAX_MESSAGES_PER_DAY`  | Fusible de coste: máx. llamadas a Anthropic por día (opcional) | — (def. `50`)    |
| `BUDGET_FILE`           | Fichero donde persiste el contador del fusible (opcional) | — (def. `.budget.json`) |
| `TELEGRAM_CHAT_ID`      | Chat al que se envía el resumen diario proactivo          | Resumen diario        |
| `DAILY_SUMMARY_HOUR`    | Hora local (0-23) del resumen diario (opcional)           | — (def. `9`)          |
| `DAILY_SUMMARY_STATE_FILE` | Fichero donde persiste la marca del último resumen enviado (opcional) | — (def. `.daily-summary.json`) |
| `LOG_LEVEL`             | Nivel de log: `debug`\|`info`\|`warn`\|`error` (opcional) | — (def. `info`)       |

Los secretos **nunca** se hardcodean: viven en `.env` (no versionado). El
repositorio solo contiene `.env.example` sin valores reales.

### Conseguir una base de datos gratis (Supabase)

1. Crea una cuenta en [supabase.com](https://supabase.com) (plan Free).
2. Crea un proyecto nuevo (elige una contraseña de base de datos y guárdala).
3. En el panel: **Project Settings → Database → Connection string** y usa el
   **pooler de Supavisor** (no la conexión directa `db.<ref>.supabase.co`, que
   hoy es solo IPv6 y falla en muchas redes).
4. Copia la cadena y sustituye `[YOUR-PASSWORD]` por la contraseña del paso 2.
5. Rellena en `.env` **dos** variables y ejecuta la migración:
   ```bash
   npm run prisma:generate
   npm run prisma:deploy
   ```
   Esto aplica la migración ya preparada en `prisma/migrations/` (crea la
   tabla `messages`) sin pedir confirmaciones interactivas.

#### Topología de conexión (dos URLs)

Supabase se conecta a través del **pooler de Supavisor**, y Prisma necesita
**dos** cadenas porque **no puede migrar en modo transacción** (las migraciones
requieren una sesión completa: advisory locks y shadow DB):

| Variable       | Uso                     | Puerto | Modo        |
| -------------- | ----------------------- | ------ | ----------- |
| `DATABASE_URL` | Runtime del bot         | `6543` | transacción |
| `DIRECT_URL`   | Migraciones (`prisma`)  | `5432` | sesión      |

```bash
# .env — mismo host (aws-0-<region>.pooler.supabase.com), usuario postgres.<ref>
DATABASE_URL="postgresql://postgres.<ref>:PASSWORD@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.<ref>:PASSWORD@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

El modo transacción (6543) es ideal para el bot: hace conexiones puntuales por
mensaje, no una conexión larga y persistente.

---

## 🕹️ Uso

### Comandos del bot

Al escribir `/` en el chat, Telegram muestra el menú (se publica al arrancar
con `setMyCommands`, sin tocar @BotFather):

| Comando        | Qué hace                                                                 |
| -------------- | ------------------------------------------------------------------------ |
| `/buscar <texto>` | Busca coincidencias de texto (case-insensitive) en el contenido y el resumen de tus mensajes; devuelve los más recientes como tarjetas. |
| `/pendientes`  | Lista tus tareas y recordatorios que aún no están hechos.                |
| `/start`       | Mensaje de bienvenida.                                                    |

Además, cualquier mensaje normal se categoriza, se resume y se guarda.

**Resumen diario proactivo.** Si defines `TELEGRAM_CHAT_ID`, el bot te envía
cada día a la hora `DAILY_SUMMARY_HOUR` (por defecto las 9:00, hora local) un
resumen con tus pendientes actuales y lo que guardaste el día anterior. Es
idempotente: sobrevive a reinicios del proceso sin duplicar el envío del mismo
día. Para conocer tu `TELEGRAM_CHAT_ID`, escribe al bot y míralo en los logs, o
usa [@userinfobot](https://t.me/userinfobot).

### Simular un mensaje (sin Telegram ni base de datos)

```bash
npm run simulate -- "Recuérdame comprar pan mañana"
```

Salida de ejemplo:

```
📨 Mensaje entrante: "Recuérdame comprar pan mañana"
🧪 Sin ANTHROPIC_API_KEY: usando categorizador heurístico offline.

✅ Resultado del pipeline:
   id:        mem_1
   tipo:      text
   categoría: recordatorio
   resumen:   Recuérdame comprar pan mañana
   fecha:     2026-07-27T21:29:30.227Z
```

Si defines `ANTHROPIC_API_KEY`, la simulación usa Claude en su lugar.

### Arrancar el bot

```bash
npm start
```

Si falta `TELEGRAM_BOT_TOKEN`, el bot **avisa y no arranca**, pero el proceso no
se cae.

### Probar con todo conectado

Cuando ya tengas las tres claves (`TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`,
`DATABASE_URL`) en tu `.env`:

```bash
npm run prisma:generate && npm run prisma:deploy   # crea la tabla si no existe
npm start
```

Escríbele al bot por Telegram: cada mensaje se categoriza con Claude
(`claude-haiku-4-5` por defecto) y se guarda en PostgreSQL. Los logs
estructurados (JSON por línea, en stdout) muestran cada mensaje procesado, con
`model` y `maxMessagesPerDay` al arrancar. Si algo falla (red, rate limit,
fusible de coste agotado), el bot sigue respondiendo con el categorizador
offline en vez de caerse.

---

## 🧪 Tests y calidad

```bash
npm run typecheck     # comprobación de tipos (tsc --noEmit)
npm test              # batería de tests (Vitest)
npm run test:coverage # tests + informe de cobertura
npm run check         # typecheck + tests (lo que se exige antes de cada commit)
```

Los tests **no dependen de servicios reales**: usan mocks e inyección de
dependencias. Cubren la lógica de negocio (categorización, parsing de la
respuesta de la IA, pipeline, repositorios, selección de implementaciones) y
sus casos límite:

- Fallo de la API de Anthropic (errores 4xx/5xx, rate limits, timeouts).
- Fusible de coste agotado (`MAX_MESSAGES_PER_DAY`) y su persistencia en disco.
- Mensajes vacíos o inválidos (rechazados antes de gastar una llamada a la IA).
- Mensajes gigantes (truncado sin partir caracteres multibyte/emoji).
- Caracteres de control, BOM y saltos de línea al saneamiento del contenido.

---

## 🗂️ Estructura del proyecto

```
.
├── prisma/
│   └── schema.prisma        # modelo Message (+ embedding preparado para fase 2)
├── src/
│   ├── ai/                  # categorización/resumen (Claude + offline)
│   │   ├── anthropic.ts     #   cliente de Anthropic (perezoso)
│   │   ├── categorizer.ts   #   AnthropicCategorizer + parsing
│   │   ├── resilientCategorizer.ts  # timeout + reintentos con backoff
│   │   ├── budgetedCategorizer.ts   # aplica el fusible de coste
│   │   ├── offlineCategorizer.ts
│   │   └── types.ts         #   categorías, interfaces (Categorizer, ...)
│   ├── config/
│   │   └── env.ts           # lectura de variables de entorno (sin lanzar)
│   ├── cost/
│   │   ├── budget.ts        # DailyBudget (fusible) + interfaz BudgetStore
│   │   └── fileBudgetStore.ts  # contador persistido en disco
│   ├── db/
│   │   ├── repository.ts    # interfaz + implementación en memoria
│   │   └── prismaRepository.ts  # implementación Prisma (import perezoso)
│   ├── logging/
│   │   ├── logger.ts        # logger estructurado (JSON)
│   │   └── index.ts         # logger raíz + avisos de configuración
│   ├── pipeline/
│   │   ├── processMessage.ts# núcleo del sistema
│   │   ├── sanitize.ts      # validación y saneado del contenido entrante
│   │   └── factory.ts       # elige implementación según el entorno
│   ├── telegram/
│   │   ├── bot.ts           # bot de Telegraf (no bloquea si falta el token)
│   │   └── errors.ts        # manejo de errores de red/API + reconexión
│   ├── cli/
│   │   └── simulate.ts      # `npm run simulate`
│   └── index.ts             # entrypoint (arranca el bot)
├── tests/                   # tests de Vitest (uno por módulo)
├── Dockerfile                # imagen multi-stage (ver sección Docker)
├── CLAUDE.md                # reglas fijas del proyecto
├── SETUP.md                 # puesta en marcha paso a paso
├── ROADMAP.md                # hacia dónde va el proyecto
├── CONTRIBUTING.md          # cómo reportar bugs o contribuir código
└── .env.example             # plantilla de variables (sin secretos)
```

---

## 🐳 Docker

Pensado para cuando el bot tenga que correr de forma persistente fuera del
portátil (una VM, un servidor casero, etc.). El `Dockerfile` está listo, pero
**no se despliega automáticamente** — se construye y arranca a mano cuando tú
decidas:

```bash
docker build -t telegram-claude-classifier .

docker run --init \
  --env-file .env \
  -v bot_data:/data \
  telegram-claude-classifier
```

Notas:

- Es una imagen **multi-stage**: la etapa de build compila TypeScript y genera
  el cliente de Prisma; la etapa final solo lleva dependencias de producción.
- Corre como usuario **no-root**.
- El bot usa *polling*, así que la imagen **no expone ningún puerto**.
- El volumen `/data` guarda el contador del fusible de coste
  (`BUDGET_FILE=/data/budget.json` dentro del contenedor), para que sobreviva
  a reinicios del contenedor.
- Las tres claves (`TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `DATABASE_URL`)
  se pasan por `--env-file .env`; nunca se hornean en la imagen.

---

## 🔭 Fase 2 (preparada, no activa)

El esquema de Prisma deja **listo y comentado** un campo `embedding` para
búsqueda semántica con [`pgvector`](https://github.com/pgvector/pgvector). Se
activará en la fase 2 sin reestructurar el resto del sistema.

---

## 📜 Reglas del proyecto

Las reglas fijas (nunca hardcodear secretos, cada commit compila y pasa tests,
cobertura de la lógica de negocio) están documentadas en
[`CLAUDE.md`](./CLAUDE.md).

---

## 🔗 Más

- **[SETUP.md](./SETUP.md)** — puesta en marcha paso a paso.
- **[ROADMAP.md](./ROADMAP.md)** — hacia dónde va el proyecto.
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — cómo reportar bugs o contribuir código.
- **[LICENSE](./LICENSE)** — MIT.
