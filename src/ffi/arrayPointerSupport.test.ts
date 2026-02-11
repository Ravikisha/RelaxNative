import { describe, it, expect } from 'vitest';

import { loadNative } from '../loader.js';
import { writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('FFI array pointer support', () => {
  it('allows passing a JS number[] for int* (marshalled as Int32Array)', async () => {
    // Inline C so the test is self-contained.
    const src = `
// @sync
int twoSum(const int* nums, int numsSize, int target) {
  for (int i = 0; i < numsSize; i++) {
    for (int j = i + 1; j < numsSize; j++) {
      if (nums[i] + nums[j] == target) return 1;
    }
  }
  return 0;
}
`;

    const dir = mkdtempSync(join(tmpdir(), 'relaxnative-test-'));
    const file = join(dir, 'twoSum.c');
    writeFileSync(file, src, 'utf8');

    const mod: any = await loadNative(file, {
      // process isolation matches how users run it during native dev
      isolation: 'process',
    });

    const out = await mod.twoSum([2, 7, 11, 15], 4, 9);
    expect(out).toBe(1);
  }, 60_000);

  it('throws a clear error for pointer-to-pointer args (int**)', async () => {
    const src = `
// @sync
int takes_pp(int** p) { (void)p; return 123; }
`;

  const dir = mkdtempSync(join(tmpdir(), 'relaxnative-test-'));
  const file = join(dir, 'pp.c');
  writeFileSync(file, src, 'utf8');

  await expect(loadNative(file, { isolation: 'process' })).rejects.toThrow(/pointer-to-pointer/i);
  }, 60_000);
});
