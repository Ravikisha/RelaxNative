import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { __resetConfigCacheForTests, loadOptionalConfig } from './config.js';

describe('config loader', () => {
  afterEach(() => {
    __resetConfigCacheForTests();
  });

  it('returns null when config file is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'relaxnative-cfg-'));
    const cfg = await loadOptionalConfig(dir);
    expect(cfg).toBe(null);
  });

  it('loads relaxnative.config.js (default export)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'relaxnative-cfg-'));
    writeFileSync(
      join(dir, 'relaxnative.config.js'),
      `export default { debug: true, cacheDir: ".cache/custom" };\n`,
      'utf8',
    );

    const cfg = await loadOptionalConfig(dir);
    expect(cfg?.debug).toBe(true);
    expect(cfg?.cacheDir).toBe('.cache/custom');
  });
});
