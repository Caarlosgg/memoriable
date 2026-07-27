# 🤖 Clasificador de mensajes de Telegram con Claude

Bot de Telegram que **recibe mensajes**, los **categoriza** y **resume** con la
API de Anthropic (Claude), y los **persiste** en PostgreSQL mediante Prisma.

Está diseñado para ser **modular y desacoplado**: si falta alguna variable de
entorno (token de Telegram, cadena de base de datos o API key de Anthropic), ese
módulo concreto no arranca, pero **el resto del sistema se sigue pudiendo
ejecutar y probar** — incluido un pipeline de simulación de extremo a extremo.

---

## ✨ Características

- **Categorización + resumen** de cada mensaje vía Claude (`claude-opus-4-8` por
  defecto, configurable).
- **Persistencia** en PostgreSQL con Prisma (esquema tipado y migraciones).
- **Bot de Telegram** con Telegraf en modo *polling*.
- **CLI de simulación** para probar el pipeline completo sin Telegram ni base de
  datos reales.
- **Categorizador offline** (heurístico) de reserva: si no hay API key, la
  simulación sigue funcionando sin salir a la red.
- **Tests con Vitest** y mocks; la lógica de negocio está cubierta.
- **Desacoplamiento por inyección de dependencias**: la lógica no conoce
  Telegram, Prisma ni la SDK de Anthropic directamente.

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
| `ANTHROPIC_API_KEY`      | `AnthropicCategorizer` (Claude) |
| *(sin API key)*          | `OfflineCategorizer` (heurístico) |
| `DATABASE_URL`           | `PrismaMessageRepository`     |
| *(sin `DATABASE_URL`)*   | `InMemoryMessageRepository`   |

---

## 📦 Requisitos

- **Node.js ≥ 20** (ver `.nvmrc`).
- Para persistencia real: una base de datos **PostgreSQL**.
- Para el bot: un **token de Telegram** (de [@BotFather](https://t.me/BotFather)).
- Para categorización real: una **API key de Anthropic**.

> Nada de esto es necesario para ejecutar los tests o la simulación offline.

---

## 🚀 Puesta en marcha

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# …y rellena los valores en .env

# 3. (Opcional, para persistencia real) generar el cliente de Prisma y migrar
npm run prisma:generate
npm run prisma:migrate
```

### Variables de entorno

| Variable             | Descripción                                | Obligatoria para   |
| -------------------- | ------------------------------------------ | ------------------ |
| `DATABASE_URL`       | Cadena de conexión de PostgreSQL           | Persistencia real  |
| `TELEGRAM_BOT_TOKEN` | Token del bot de Telegram                  | Arrancar el bot    |
| `ANTHROPIC_API_KEY`  | API key de Claude                          | Categorización real |
| `ANTHROPIC_MODEL`    | Modelo de Claude (opcional)                | — (def. `claude-opus-4-8`) |

Los secretos **nunca** se hardcodean: viven en `.env` (no versionado). El
repositorio solo contiene `.env.example` sin valores reales.

---

## 🕹️ Uso

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

---

## 🧪 Tests y calidad

```bash
npm run typecheck     # comprobación de tipos (tsc --noEmit)
npm test              # batería de tests (Vitest)
npm run test:coverage # tests + informe de cobertura
npm run check         # typecheck + tests (lo que se exige antes de cada commit)
```

Los tests **no dependen de servicios reales**: usan mocks e inyección de
dependencias. La lógica de negocio (categorización, parsing de la respuesta de
la IA, pipeline, repositorios, selección de implementaciones) está cubierta.

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
│   │   ├── offlineCategorizer.ts
│   │   └── types.ts         #   categorías, interfaces (Categorizer, ...)
│   ├── config/
│   │   └── env.ts           # lectura de variables de entorno (sin lanzar)
│   ├── db/
│   │   ├── repository.ts    # interfaz + implementación en memoria
│   │   └── prismaRepository.ts  # implementación Prisma (import perezoso)
│   ├── pipeline/
│   │   ├── processMessage.ts# núcleo del sistema
│   │   └── factory.ts       # elige implementación según el entorno
│   ├── telegram/
│   │   └── bot.ts           # bot de Telegraf (no bloquea si falta el token)
│   ├── cli/
│   │   └── simulate.ts      # `npm run simulate`
│   └── index.ts             # entrypoint (arranca el bot)
├── tests/                   # tests de Vitest (uno por módulo)
├── CLAUDE.md                # reglas fijas del proyecto
└── .env.example             # plantilla de variables (sin secretos)
```

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
