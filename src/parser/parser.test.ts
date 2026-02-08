import { describe, it, expect } from 'vitest';

import { parseNativeSource } from './index.js';

describe('native parser', () => {
  it('extracts C functions', () => {
    const result = parseNativeSource('examples/add.c', 'c');
    expect(result.functions.length).toBeGreaterThan(0);
    expect(result.functions[0].name).toBe('add');
  });
});
