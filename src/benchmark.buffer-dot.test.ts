import { describe, it, expect } from 'vitest';

import { benchmarkCompareTraditionalVsRelaxnative } from './benchmark.js';


// These tests are intentionally tiny (small buffers / low iterations) so they
// remain stable in CI, and they demonstrate the contract: caller provides the
// JS baseline + args.
describe.sequential('benchmark sum_u8 + dot_f64 (user-provided baselines)', () => {
	it('sum_u8 compares user JS baseline + args', async () => {
		const n = 1024;
		const buf = new Uint8Array(n).fill(1);
		const baseline = (b: Uint8Array, nn: number) => {
			let s = 0;
			for (let i = 0; i < nn; i++) s += b[i];
			return s;
		};
		const res = await benchmarkCompareTraditionalVsRelaxnative('examples/buffer.c', 'sum_u8', {
			iterations: 2,
			warmup: 1,
			baseline,
			args: [buf, n],
		});
		expect(res.traditional.callsPerSec).toBeGreaterThan(0);
		expect(res.relaxnative.sync.callsPerSec).toBeGreaterThan(0);
	}, 120_000);

	// NOTE: This benchmark is intermittently crashing the Vitest forks pool on Node 25
	// (the test process exits unexpectedly after completion, producing a Vitest "Unhandled Error").
	// Keep it as a benchmark, but skip it in CI until we root-cause the Node/Vitest interaction.
	it('dot_f64 compares user JS baseline + args', async () => {
		const n = 1024;
		const a = new Float64Array(n);
		const b = new Float64Array(n);
		for (let i = 0; i < n; i++) {
			a[i] = (i % 1024) * 0.001;
			b[i] = (i % 2048) * 0.002;
		}
		const baseline = (aa: Float64Array, bb: Float64Array, nn: number) => {
			let acc = 0;
			for (let i = 0; i < nn; i++) acc += aa[i] * bb[i];
			return acc;
		};
		const res = await benchmarkCompareTraditionalVsRelaxnative('examples/dot.c', 'dot_f64', {
			iterations: 2,
			warmup: 1,
			baseline,
			args: [a, b, n],
		});
		expect(res.traditional.callsPerSec).toBeGreaterThan(0);
		expect(res.relaxnative.sync.callsPerSec).toBeGreaterThan(0);
	}, 120_000);
});
