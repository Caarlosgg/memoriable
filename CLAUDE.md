# CLAUDE.md — Reglas del proyecto

Bot de Telegram que recibe mensajes, los **categoriza** y **resume** con la API
de Groq y los persiste en PostgreSQL vía Prisma.

## Reglas fijas (no negociables)

1. **Nunca hardcodear secretos.** Tokens, API keys y cadenas de conexión viven
   siempre en variables de entorno (`.env`, nunca versionado). El repositorio
   solo contiene `.env.example` sin valores reales. Ningún secreto en código,
   tests, logs ni mensajes de commit.
2. **Cada commit compila y pasa los tests.** Antes de commitear:
   `npm run typecheck && npm test` deben terminar en verde. No se commitea
   código que rompa el build o deje tests fallando.
   - **Commits agrupados por hito funcional completo**, no por cada paso
     intermedio. Si una tarea tiene 5 sub-pasos relacionados, es un commit al
     final, no cinco. Excepción: si un cambio es arriesgado o de verdad
     independiente, sí merece su propio commit.
3. **Cobertura de tests para la lógica de negocio.** Toda la lógica de negocio
   (categorización/resumen, pipeline de procesamiento, repositorios, parsing de
   la respuesta de la IA) tiene tests. Los tests no dependen de servicios reales
   (Telegram, PostgreSQL, API de Groq): se usan mocks e inyección de
   dependencias.
4. **Cualquier comando que toque el esquema o los datos de una base de datos
   de producción exige confirmación explícita, SIEMPRE, sin excepción.**
   Incluye (no exhaustivo): `prisma migrate deploy`, `prisma migrate dev`,
   `prisma db push`, `prisma db seed`, `prisma studio`, y cualquier
   equivalente (scripts de npm que los invoquen, SQL directo contra la BD
   real, etc.). Esto **no es negociable ni situacional**: da igual que el
   cambio sea aditivo y no destructivo (p. ej. añadir una columna con
   `DEFAULT`) — nunca se auto-aprueba. Se pregunta primero, siempre, pase lo
   que pase. Los comandos de solo lectura contra la BD real (`prisma migrate
   status`, `prisma validate`, `prisma generate`) no están sujetos a esta
   regla.

## Principios de arquitectura

- **Desacoplamiento por variables de entorno.** Si falta una variable de
  entorno (`DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `GROQ_API_KEY`), el módulo
  que la necesita **no arranca**, pero el resto del sistema sigue siendo
  ejecutable y testeable. Nada de imports que fallen en carga por falta de
  secretos: la inicialización de clientes externos es **perezosa** (lazy).
- **Inyección de dependencias.** La lógica de negocio recibe sus colaboradores
  (`Categorizer`, `MessageRepository`) por parámetro. Esto permite sustituirlos
  por implementaciones en memoria / mock en los tests y en el CLI de simulación.
- **Interfaces sobre implementaciones.** El pipeline depende de interfaces, no
  de Prisma ni de la SDK de Groq directamente.

## Estilo de trabajo (eficiencia)

- **Documentación solo cuando cambia la superficie externa.** `README.md` y
  `SETUP.md` se tocan únicamente cuando cambia algo que afecta a cómo se
  instala, configura o usa el proyecto desde fuera (nueva variable de entorno,
  nuevo comando, cambio de flujo). Los cambios internos de implementación no
  requieren tocar documentación.
- **Resúmenes de fin de sesión breves.** Lista de qué cambió y por qué, sin
  narrar cada sub-paso intermedio. Si no cabe en 5-6 líneas, se está
  detallando de más.
- **Decisión autónoma.** Se decide sin pedir confirmación en decisiones de
  diseño razonables. Se para ante algo que pueda sobrescribir datos guardados
  de forma irreversible, y **siempre** ante lo descrito en la regla 4
  (esquema/datos de producción), sea o no reversible el cambio.

## Variables de entorno

| Variable             | Uso                                   | Obligatoria para |
| -------------------- | ------------------------------------- | ---------------- |
| `DATABASE_URL`       | Cadena de conexión PostgreSQL (Prisma) | Persistencia real |
| `TELEGRAM_BOT_TOKEN` | Token del bot de Telegram (Telegraf)  | Arrancar el bot  |
| `GROQ_API_KEY`       | API key de Groq                        | Categorización real |
| `GROQ_MODEL`         | Modelo servido por Groq (opcional)     | — (default `openai/gpt-oss-120b`) |

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
Groq · Vitest.
