import { describe, it, expect } from 'vitest';

import {
	benchmarkCompareTraditionalVsRelaxnative,
	formatBenchmarkTraditionalCompare,
} from './benchmark.js';

describe('benchmark traditional vs relaxnative', () => {
	it('benchmarks JS baseline + relaxnative for known demo function (add)', async () => {
		const baseline = (a: number, b: number) => a + b;
		const res = await benchmarkCompareTraditionalVsRelaxnative('examples/add.c', 'add', {
			iterations: 200,
			warmup: 20,
			baseline,
			args: [1, 2],
		});

		expect(res.traditional.name).toBe('traditional-js');
		expect(res.traditional.callsPerSec).toBeGreaterThan(0);
		expect(res.relaxnative.sync.callsPerSec).toBeGreaterThan(0);
		expect(res.relaxnative.worker.callsPerSec).toBeGreaterThan(0);

		const text = formatBenchmarkTraditionalCompare(res);
		expect(text).toContain('baseline');
		expect(text).toContain('add (sync)');
		expect(text).toContain('add (worker)');
	}, 60_000);

	it('requires a baseline for unknown functions', async () => {
		await expect(
			benchmarkCompareTraditionalVsRelaxnative('examples/add.c', 'not_a_real_fn', {
				iterations: 10,
				warmup: 1,
				args: [],
			}),
		).rejects.toThrow(/Missing JS baseline/i);
	});
});
