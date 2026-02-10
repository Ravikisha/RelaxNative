import { describe, it, expect } from 'vitest';

import { benchmarkCompareTraditionalVsRelaxnative } from './benchmark.js';

// This test is intentionally CPU-heavy. Keep it isolated to avoid starving
// process-isolation tests that spawn helpers and have tight timeouts.
describe.sequential('benchmark loop_sum (cpu-bound)', () => {
	it('uses a built-in baseline and default args for loop_sum', async () => {
		// Keep iterations low since each call is heavy; one call is enough for sanity.
		const res = await benchmarkCompareTraditionalVsRelaxnative('examples/loop.c', 'loop_sum', {
			iterations: 3,
			warmup: 1,
		});

		expect(res.traditional.callsPerSec).toBeGreaterThan(0);
		expect(res.relaxnative.sync.callsPerSec).toBeGreaterThan(0);
		expect(res.relaxnative.worker.callsPerSec).toBeGreaterThan(0);
	}, 120_000);
});
