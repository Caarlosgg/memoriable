import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Los tests en sí son de milisegundos (todo va con mocks), pero la primera
    // importación dinámica de un módulo en un worker frío puede tardar varios
    // segundos en Windows. Un timeout holgado evita falsos rojos por eso.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Los tests NUNCA deben depender del .env real de quien los ejecuta: si
    // hay credenciales de verdad en el entorno, la batería tiene que dar el
    // mismo resultado. Se dejan a cadena vacía (que `readString` interpreta
    // como "no definida") y dotenv, que no sobrescribe variables ya
    // presentes, respeta este valor. Cada test que necesite un valor concreto
    // lo pone con `vi.stubEnv`.
    env: {
      TELEGRAM_BOT_TOKEN: '',
      GROQ_API_KEY: '',
      GROQ_MODEL: '',
      DATABASE_URL: '',
      BUDGET_FILE: '',
      MAX_MESSAGES_PER_DAY: '',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/cli/**'],
    },
  },
});
