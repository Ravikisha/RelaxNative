import { describe, it, expect } from 'vitest';

import { loadNative } from './loader.js';

describe('hybrid execution (annotations)', () => {
  it('runs @sync function on main thread (returns value)', async () => {
    const mod = await loadNative('examples/add.c');
    const out = mod.add(2, 3);
    expect(out).toBe(5);
  });

  it('runs @async function in worker (returns Promise)', async () => {
    const mod = await loadNative('examples/heavy.c');
    const out = mod.heavy(1.0);
    expect(out).toBeInstanceOf(Promise);
    expect(typeof (await out)).toBe('number');
  }, 15000);
});
