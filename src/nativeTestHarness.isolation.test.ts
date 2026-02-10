import { describe, it, expect } from 'vitest';

import { runNativeTests } from './nativeTestHarness.js';

describe('native test harness (isolation modes)', () => {
  it('runs native tests in worker isolation', async () => {
  const { results, exitCode } = await runNativeTests('native/examples', {
      isolation: 'worker',
    });

    if (process.env.VITEST_DEBUG_HARNESS === '1') {
      // eslint-disable-next-line no-console
      console.log('[harness debug] worker', { exitCode, n: results.length, results });
    }

    expect(results.length).toBeGreaterThan(0);
    expect(exitCode).toBe(0);
  }, 60_000);

  it('runs native tests in process isolation', async () => {
  const { results, exitCode } = await runNativeTests('native/examples', {
      isolation: 'process',
    });

    if (process.env.VITEST_DEBUG_HARNESS === '1') {
      // eslint-disable-next-line no-console
      console.log('[harness debug] process', { exitCode, n: results.length, results });
    }

    expect(results.length).toBeGreaterThan(0);
    expect(exitCode).toBe(0);
  }, 60_000);
});
