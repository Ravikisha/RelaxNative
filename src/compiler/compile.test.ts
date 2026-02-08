import { describe, it, expect } from 'vitest';
import { mkdirSync } from 'fs';

import { detectCompilers } from './detect.js';
import { compileNative } from './compileNative.js';

describe('native compilation', () => {
  it('compiles a C file', () => {
    const { c, platform } = detectCompilers();
    const outDir = '.cache/test';

    mkdirSync(outDir, { recursive: true });

    const result = compileNative(c, platform, {
      sourcePath: 'examples/add.c',
      outDir,
    });

    expect(result.outputPath).toBeTruthy();
  });
});
