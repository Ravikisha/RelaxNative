import { describe, it, expect } from 'vitest';

import { benchmarkCompareTraditionalVsRelaxnative } from './benchmark.js';

// These tests allocate large typed arrays by default baselines.
// Keep them sequential to avoid memory pressure / CPU starvation in the suite.
describe.sequential('benchmark sum_u8 + dot_f64 (built-in baselines)', () => {
	it('sum_u8 runs with built-in baseline + default args', async () => {
		const res = await benchmarkCompareTraditionalVsRelaxnative(
			'examples/buffer.c',
			'sum_u8',
			{ iterations: 2, warmup: 1 },
		);
		expect(res.traditional.callsPerSec).toBeGreaterThan(0);
		expect(res.relaxnative.sync.callsPerSec).toBeGreaterThan(0);
	}, 120_000);

	it('dot_f64 runs with built-in baseline + default args', async () => {
		const res = await benchmarkCompareTraditionalVsRelaxnative('examples/dot.c', 'dot_f64', {
			iterations: 2,
			warmup: 1,
		});
		expect(res.traditional.callsPerSec).toBeGreaterThan(0);
		expect(res.relaxnative.sync.callsPerSec).toBeGreaterThan(0);
	}, 120_000);
});
