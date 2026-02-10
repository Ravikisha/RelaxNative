import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { installPackage } from './installer.js';
import { loadNative } from '../loader.js';
import { readRelaxJson } from './relaxJson.js';

describe('registry e2e (file: install)', () => {
  it('installs and loads a registry package like a local native file', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'relaxnative-reg-'));

    const res = installPackage('file:examples/registry/fast-matrix', projectRoot);
    expect(res.pkg).toBe('fast-matrix');

    const pkgDir = join(projectRoot, 'native', 'registry', 'fast-matrix');
    const manifest = readRelaxJson(pkgDir);

    const mod = await loadNative(join(pkgDir, manifest.exports[0].source));
    expect(typeof mod.mul2).toBe('function');
  });
});
