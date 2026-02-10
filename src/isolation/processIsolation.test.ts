import { describe, it, expect } from 'vitest';

import { loadNative } from '../loader.js';
import { stopIsolatedRuntime } from '../worker/processClient.js';

describe('process isolation', () => {
  it('detects native crash and rejects, without crashing the test process', async () => {
    const mod: any = await loadNative('examples/crash.c', { isolation: 'process' });

    // Should reject (helper crashes) but current process stays alive.
    await expect(mod.crash_segv()).rejects.toThrow(/Isolated runtime exited/i);
  }, 20_000);

  it('restarts helper after a crash', async () => {
    const mod: any = await loadNative('examples/crash.c', { isolation: 'process' });

    await expect(mod.crash_segv()).rejects.toThrow(/Isolated runtime exited/i);

  // Ensure any partially-dead helper is fully terminated before the next call.
  stopIsolatedRuntime();

    // Second call should start a fresh helper and crash again (still reject).
    await expect(mod.crash_segv()).rejects.toThrow(/Isolated runtime exited/i);
  }, 60_000);
});
