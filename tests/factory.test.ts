import { afterEach, describe, expect, it, vi } from 'vitest';

describe('pipeline/factory', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('sin ANTHROPIC_API_KEY usa el categorizador offline', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const { resolveCategorizer } = await import('../src/pipeline/factory.js');
    const { OfflineCategorizer } = await import('../src/ai/offlineCategorizer.js');
    expect(resolveCategorizer()).toBeInstanceOf(OfflineCategorizer);
  });

  it('con ANTHROPIC_API_KEY usa el categorizador de Claude', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    const { resolveCategorizer } = await import('../src/pipeline/factory.js');
    const { AnthropicCategorizer } = await import('../src/ai/categorizer.js');
    expect(resolveCategorizer()).toBeInstanceOf(AnthropicCategorizer);
  });

  it('sin DATABASE_URL usa el repositorio en memoria', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { resolveRepository } = await import('../src/pipeline/factory.js');
    const { InMemoryMessageRepository } = await import('../src/db/repository.js');
    expect(resolveRepository()).toBeInstanceOf(InMemoryMessageRepository);
  });
});
