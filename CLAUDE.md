# CLAUDE.md — Reglas del proyecto

Bot de Telegram que recibe mensajes, los **categoriza** y **resume** con la API
de Anthropic (Claude) y los persiste en PostgreSQL vía Prisma.

## Reglas fijas (no negociables)

1. **Nunca hardcodear secretos.** Tokens, API keys y cadenas de conexión viven
   siempre en variables de entorno (`.env`, nunca versionado). El repositorio
   solo contiene `.env.example` sin valores reales. Ningún secreto en código,
   tests, logs ni mensajes de commit.
2. **Cada commit compila y pasa los tests.** Antes de commitear:
   `npm run typecheck && npm test` deben terminar en verde. No se commitea
   código que rompa el build o deje tests fallando.
3. **Cobertura de tests para la lógica de negocio.** Toda la lógica de negocio
   (categorización/resumen, pipeline de procesamiento, repositorios, parsing de
   la respuesta de la IA) tiene tests. Los tests no dependen de servicios reales
   (Telegram, PostgreSQL, API de Anthropic): se usan mocks e inyección de
   dependencias.

## Principios de arquitectura

- **Desacoplamiento por variables de entorno.** Si falta una variable de
  entorno (`DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`), el módulo
  que la necesita **no arranca**, pero el resto del sistema sigue siendo
  ejecutable y testeable. Nada de imports que fallen en carga por falta de
  secretos: la inicialización de clientes externos es **perezosa** (lazy).
- **Inyección de dependencias.** La lógica de negocio recibe sus colaboradores
  (`Categorizer`, `MessageRepository`) por parámetro. Esto permite sustituirlos
  por implementaciones en memoria / mock en los tests y en el CLI de simulación.
- **Interfaces sobre implementaciones.** El pipeline depende de interfaces, no
  de Prisma ni de la SDK de Anthropic directamente.

## Variables de entorno

| Variable             | Uso                                   | Obligatoria para |
| -------------------- | ------------------------------------- | ---------------- |
| `DATABASE_URL`       | Cadena de conexión PostgreSQL (Prisma) | Persistencia real |
| `TELEGRAM_BOT_TOKEN` | Token del bot de Telegram (Telegraf)  | Arrancar el bot  |
| `ANTHROPIC_API_KEY`  | API key de Claude                      | Categorización real |
| `ANTHROPIC_MODEL`    | Modelo de Claude (opcional)            | — (default `claude-opus-4-8`) |

## Comandos

- `npm run typecheck` — comprueba tipos (tsc --noEmit).
- `npm test` — ejecuta la batería de tests (Vitest).
- `npm run build` — compila a `dist/`.
- `npm run simulate -- "texto de ejemplo"` — simula un mensaje entrante y corre
  el pipeline completo sin Telegram ni base de datos reales.
- `npm start` — arranca el bot en modo polling (si falta el token, avisa y no
  arranca, pero no rompe).

## Stack

TypeScript · Node.js · Telegraf (polling) · Prisma + PostgreSQL · API de
Anthropic (Claude) · Vitest.
