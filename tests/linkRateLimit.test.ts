import { describe, expect, it, vi, afterEach } from 'vitest';
import { createLinkAttemptLimiter } from '../src/telegram/linkRateLimit.js';

describe('createLinkAttemptLimiter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('no bloquea antes de alcanzar el máximo de fallos', () => {
    const limiter = createLinkAttemptLimiter(3, 60_000);
    limiter.registerFailure(1);
    limiter.registerFailure(1);
    expect(limiter.isBlocked(1)).toBe(false);
  });

  it('bloquea al alcanzar el máximo de fallos', () => {
    const limiter = createLinkAttemptLimiter(3, 60_000);
    limiter.registerFailure(1);
    limiter.registerFailure(1);
    limiter.registerFailure(1);
    expect(limiter.isBlocked(1)).toBe(true);
  });

  it('cada chat tiene su propio contador', () => {
    const limiter = createLinkAttemptLimiter(1, 60_000);
    limiter.registerFailure(1);
    expect(limiter.isBlocked(1)).toBe(true);
    expect(limiter.isBlocked(2)).toBe(false);
  });

  it('clear reinicia el contador de un chat', () => {
    const limiter = createLinkAttemptLimiter(1, 60_000);
    limiter.registerFailure(1);
    limiter.clear(1);
    expect(limiter.isBlocked(1)).toBe(false);
  });

  it('el bloqueo expira al pasar la ventana', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    const limiter = createLinkAttemptLimiter(1, 60_000);
    limiter.registerFailure(1);
    expect(limiter.isBlocked(1)).toBe(true);

    now.mockReturnValue(60_001);
    expect(limiter.isBlocked(1)).toBe(false);
  });

  it('un fallo tras la ventana empieza una ventana nueva, no acumula con la vieja', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    const limiter = createLinkAttemptLimiter(2, 60_000);
    limiter.registerFailure(1);

    now.mockReturnValue(60_001);
    limiter.registerFailure(1);
    expect(limiter.isBlocked(1)).toBe(false);
  });
});
