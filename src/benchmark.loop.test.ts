import { describe, it, expect } from 'vitest';

import { benchmarkCompareTraditionalVsRelaxnative } from './benchmark.js';

// This test is intentionally CPU-heavy. Keep it isolated to avoid starving
// process-isolation tests that spawn helpers and have tight timeouts.
describe.sequential('benchmark loop_sum (cpu-bound)', () => {
	it('compares user JS baseline + args for loop_sum', async () => {
		const n = 2_000_000;
		const baseline = (nn: number) => {
			let acc = 0;
			for (let i = 0; i < nn; i++) {
				acc += (i ^ 0x9e3779b9) & 0xffff;
			}
			return acc;
		};
		// Keep iterations low since each call is heavy; a few calls is enough for sanity.
		const res = await benchmarkCompareTraditionalVsRelaxnative('examples/loop.c', 'loop_sum', {
			iterations: 3,
			warmup: 1,
			baseline,
			args: [n],
		});

		expect(res.traditional.callsPerSec).toBeGreaterThan(0);
		expect(res.relaxnative.sync.callsPerSec).toBeGreaterThan(0);
		expect(res.relaxnative.worker.callsPerSec).toBeGreaterThan(0);
	}, 120_000);
});
