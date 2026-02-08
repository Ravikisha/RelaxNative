import { describe, it, expect } from 'vitest';

import { loadNative } from '../loader.js';

describe('ffi execution', () => {
  it('executes native C function', async () => {
    const math = await loadNative('examples/add.c');
    const result = math.add(2, 3);
    expect(result).toBe(5);
  });
});
