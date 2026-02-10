import { describe, it, expect } from 'vitest';

import { benchmarkNativeFunction } from './benchmark.js';

describe('benchmark args', () => {
  it('uses caller-provided args array', async () => {
    const res = await benchmarkNativeFunction('examples/add.c', 'add', {
      mode: 'sync',
      iterations: 50,
      warmup: 5,
      args: [3, 4],
    });

    expect(res.fnName).toBe('add');
    expect(res.iterations).toBe(50);
    expect(res.warmup).toBe(5);
    expect(res.callsPerSec).toBeGreaterThan(0);
    expect(res.avgLatencyMs).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
