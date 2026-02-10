import { describe, it, expect, afterEach } from 'vitest';

import { loadNative } from './loader.js';

describe('loadNative hot reload gate', () => {
  const prev = process.env.RELAXNATIVE_DEV;

  afterEach(() => {
    if (prev == null) delete process.env.RELAXNATIVE_DEV;
    else process.env.RELAXNATIVE_DEV = prev;
  });

  it('rejects config overrides when RELAXNATIVE_DEV=1', async () => {
    process.env.RELAXNATIVE_DEV = '1';
    await expect(
      loadNative('examples/add.c', { config: { defaultMode: 'sync' } }),
    ).rejects.toThrow(/does not support config overrides/i);
  }, 60_000);
});
