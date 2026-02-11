import { describe, it, expect } from 'vitest';
import { benchmarkCompareTraditionalVsRelaxnative } from './benchmark.js';

// Keep sequential-ish behavior (suite already disables file parallelism)
// and keep iterations low to avoid long CI times.

describe.skip('benchmark examples (more)', () => {
  it('saxpy_f64 compares user-provided JS baseline vs relaxnative', async () => {
    const n = 64;
    const a = 1.0001;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = (i % 1024) * 0.001;
      y[i] = (i % 2048) * 0.002;
    }
    const baseline = (aa: number, xx: Float64Array, yy: Float64Array, nn: number) => {
      for (let i = 0; i < nn; i++) yy[i] = aa * xx[i] + yy[i];
      return yy[0];
    };
    const res = await benchmarkCompareTraditionalVsRelaxnative('examples/saxpy.c', 'saxpy_f64', {
      iterations: 1,
      warmup: 1,
      baseline,
      args: [a, x, y, n],
      // In tests, avoid in-process native invocation (can segfault in some Node/koffi combos).
      // The worker benchmark is still representative and keeps the suite stable.
      mode: 'worker',
    });
    expect(res.traditional.callsPerSec).toBeGreaterThan(0);
    expect(res.relaxnative.worker.callsPerSec).toBeGreaterThan(0);
  }, 30_000);

  it('matmul_f32 compares user-provided JS baseline vs relaxnative', async () => {
    const M = 16;
    const K = 16;
    const N = 16;
    const A = new Float32Array(M * K);
    const B = new Float32Array(K * N);
    const C = new Float32Array(M * N);
    for (let i = 0; i < A.length; i++) A[i] = (i % 13) * 0.01;
    for (let i = 0; i < B.length; i++) B[i] = (i % 7) * 0.02;
    const baseline = (a: Float32Array, b: Float32Array, c: Float32Array, m: number, k: number, n: number) => {
      for (let i = 0; i < m; i++) {
        for (let j = 0; j < n; j++) {
          let acc = 0;
          for (let kk = 0; kk < k; kk++) acc += a[i * k + kk] * b[kk * n + j];
          c[i * n + j] = acc;
        }
      }
      return c[0];
    };
    const res = await benchmarkCompareTraditionalVsRelaxnative('examples/matmul.c', 'matmul_f32', {
      iterations: 1,
      warmup: 1,
      baseline,
      args: [A, B, C, M, K, N],
      mode: 'worker',
    });
    expect(res.traditional.callsPerSec).toBeGreaterThan(0);
    expect(res.relaxnative.worker.callsPerSec).toBeGreaterThan(0);
  }, 60_000);
});
