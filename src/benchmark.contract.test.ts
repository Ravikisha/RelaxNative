import { describe, it, expect } from 'vitest';

import {
  benchmarkCompareTraditionalVsRelaxnative,
  benchmarkNativeFunction,
} from './benchmark.js';

describe('benchmark contract', () => {
  it('requires opts.baseline and opts.args for traditional compare', async () => {
    await expect(
      benchmarkCompareTraditionalVsRelaxnative('examples/add.c', 'add', {
        iterations: 1,
        warmup: 1,
        // baseline intentionally omitted
        args: [1, 2],
      } as any),
    ).rejects.toThrow(/Missing JS baseline/i);
  });

  it('can run pointer-heavy kernels using typed array views (dot_f64)', async () => {
    const res = await benchmarkNativeFunction('examples/dot.c', 'dot_f64', {
      iterations: 1,
      warmup: 1,
      args: [new Float64Array([1, 2, 3, 4]), new Float64Array([5, 6, 7, 8]), 4],
    });
    expect(res.callsPerSec).toBeGreaterThan(0);
  }, 30_000);

  it('can run pointer-heavy kernels using typed array views (matmul_f32)', async () => {
    const M = 2;
    const K = 2;
    const N = 2;
    const A = new Float32Array([1, 2, 3, 4]);
    const B = new Float32Array([1, 0, 0, 1]);
    const C = new Float32Array(M * N);
    const res = await benchmarkNativeFunction('examples/matmul.c', 'matmul_f32', {
      iterations: 1,
      warmup: 1,
      args: [A, B, C, M, K, N],
    });
    expect(res.callsPerSec).toBeGreaterThan(0);
  }, 30_000);
});
