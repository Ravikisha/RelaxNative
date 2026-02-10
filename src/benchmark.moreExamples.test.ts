import { describe, it, expect } from 'vitest';
import { benchmarkCompareTraditionalVsRelaxnative } from './benchmark.js';

// Keep sequential-ish behavior (suite already disables file parallelism)
// and keep iterations low to avoid long CI times.

describe('benchmark examples (more)', () => {
  it('saxpy_f64 has built-in baseline + default args', async () => {
    const res = await benchmarkCompareTraditionalVsRelaxnative('examples/saxpy.c', 'saxpy_f64', {
      iterations: 1,
      warmup: 1,
    });
    expect(res.traditional.callsPerSec).toBeGreaterThan(0);
    expect(res.relaxnative.sync.callsPerSec).toBeGreaterThan(0);
  }, 30_000);

  it('matmul_f32 has built-in baseline + default args', async () => {
    const res = await benchmarkCompareTraditionalVsRelaxnative('examples/matmul.c', 'matmul_f32', {
      iterations: 1,
      warmup: 1,
    });
    expect(res.traditional.callsPerSec).toBeGreaterThan(0);
    expect(res.relaxnative.sync.callsPerSec).toBeGreaterThan(0);
  }, 60_000);
});
