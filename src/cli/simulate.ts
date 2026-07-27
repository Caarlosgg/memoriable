import type { IncomingMessage } from '../ai/types.js';
import { InMemoryMessageRepository } from '../db/repository.js';
import { resolveCategorizer } from '../pipeline/factory.js';
import { processMessage, type Pipeline } from '../pipeline/processMessage.js';
import { hasAnthropic } from '../config/env.js';

/**
 * Ejecuta el pipeline sobre un texto de ejemplo. Extraído aparte del arranque
 * del CLI para poder testearlo. Fuerza el repositorio en memoria (una
 * simulación nunca escribe en la base de datos real).
 */
export async function runSimulation(texto: string, pipeline?: Pipeline) {
  const effective: Pipeline =
    pipeline ?? {
      categorizer: resolveCategorizer(),
      repository: new InMemoryMessageRepository(),
    };

  const message: IncomingMessage = { tipo: 'text', contenido: texto };
  return processMessage(message, effective);
}

async function main(): Promise<void> {
  const texto = process.argv.slice(2).join(' ').trim();
  if (!texto) {
    console.error('Uso: npm run simulate -- "texto de ejemplo"');
    process.exitCode = 1;
    return;
  }

  console.log(`\n📨 Mensaje entrante: "${texto}"`);
  console.log(
    hasAnthropic()
      ? '🤖 Categorizando con Claude (ANTHROPIC_API_KEY presente)...'
      : '🧪 Sin ANTHROPIC_API_KEY: usando categorizador heurístico offline.',
  );

  const stored = await runSimulation(texto);

  console.log('\n✅ Resultado del pipeline:');
  console.log(`   id:        ${stored.id}`);
  console.log(`   tipo:      ${stored.tipo}`);
  console.log(`   categoría: ${stored.categoria}`);
  console.log(`   resumen:   ${stored.resumen}`);
  console.log(`   fecha:     ${stored.fecha.toISOString()}\n`);
}

// Ejecuta solo cuando se invoca directamente (no al importarse en tests).
const invokedDirectly = process.argv[1]?.endsWith('simulate.ts') || process.argv[1]?.endsWith('simulate.js');
if (invokedDirectly) {
  main().catch((err) => {
    console.error('Error en la simulación:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
