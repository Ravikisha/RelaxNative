import { describe, it, expect } from 'vitest';

import { loadNative } from '../loader.js';

describe('multi-file C/C++ builds', () => {
  it('compiles and links multiple C files with includePaths', async () => {
    const mod: any = await loadNative('examples/multi/entry.c', {
      isolation: 'in-process',
      build: {
        sources: ['examples/multi/add_impl.c'],
        includePaths: ['examples/multi'],
      },
    });

    expect(mod.add_from_entry(2, 3)).toBe(5);
  });
});
