import { describe, it, expect } from 'vitest';

import { detectCompilers } from './detect.js';
import { compileWithCache } from './compileWithCache.js';

describe('compile cache', () => {
  it('reuses cached build', () => {
    const { c, platform } = detectCompilers();

    const first = compileWithCache(c, platform, {
      sourcePath: 'examples/add.c',
      outDir: '.cache/test',
    });

    const second = compileWithCache(c, platform, {
      sourcePath: 'examples/add.c',
      outDir: '.cache/test',
    });

    expect(first.outputPath).toBe(second.outputPath);
  });
});
