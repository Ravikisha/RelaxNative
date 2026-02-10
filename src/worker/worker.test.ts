import { describe, it, expect } from 'vitest';
import { loadNative } from '../loader.js';

describe('worker async execution', () => {
  it('runs heavy function asynchronously', async () => {
    const mod = await loadNative('examples/heavy.c');
    const result = await mod.heavy(1.0);
    expect(typeof result).toBe('number');
  }, 15000);
});
