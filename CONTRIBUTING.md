# Contribuir

Gracias por el interés en el proyecto. Esto es intencionadamente corto.

## Reportar un bug

Abre un [issue](../../issues) con:

- Qué esperabas que pasara y qué pasó en su lugar.
- Pasos para reproducirlo (idealmente con `npm run simulate -- "..."`, que no
  necesita ninguna clave).
- El mensaje de error completo, si lo hay.

Nunca incluyas tokens, API keys ni cadenas de conexión reales en un issue.

## Proponer una idea

Abre un issue describiendo el caso de uso. Échale un vistazo antes a
[ROADMAP.md](./ROADMAP.md) para ver si ya está contemplado.

## Contribuir código

1. Haz un fork y crea una rama a partir de `main`.
2. Antes de commitear, esto tiene que terminar en verde:
   ```bash
   npm run check   # typecheck + tests
   ```
3. Si añades lógica de negocio (categorización, pipeline, repositorios,
   parsing de la respuesta de la IA), añade tests con mocks — no debe
   depender de Telegram, PostgreSQL ni la API de Anthropic reales.
4. Abre un pull request describiendo el qué y el porqué del cambio.

Las reglas fijas del proyecto (secretos, cobertura de tests, arquitectura
desacoplada) están en [CLAUDE.md](./CLAUDE.md) — léelo antes de tocar código,
son no negociables.
