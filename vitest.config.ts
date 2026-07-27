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
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/cli/**'],
    },
  },
});
