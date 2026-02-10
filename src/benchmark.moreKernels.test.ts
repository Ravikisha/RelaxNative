import { describe, it, expect } from 'vitest';

import { loadNative } from './index.js';
import { alloc } from './memory/index.js';

// Keep these tests very light: we only validate that
// - built-in baselines exist
// - native compilation + invocation works
// - the benchmark runner returns sane numbers

describe.sequential('native example kernels (smoke)', () => {
  it('xor_u8 compiles and produces expected output', async () => {
  const { xor_u8 } = await loadNative('examples/xor.c', { isolation: 'worker' });

    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([9, 8, 7, 6]);
    const out = new Uint8Array(4);

    xor_u8(a, b, out, out.length);
    expect(Array.from(out)).toEqual([1 ^ 9, 2 ^ 8, 3 ^ 7, 4 ^ 6]);
  }, 60_000);

  it('crc32_u8 compiles and returns a deterministic checksum', async () => {
  const { crc32_u8 } = await loadNative('examples/crc32.c', { isolation: 'worker' });
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const a = crc32_u8(data, data.length);
    const b = crc32_u8(data, data.length);
    expect(a).toBe(b);
  }, 60_000);

  it('histogram_u8 compiles and populates bins', async () => {
  const { histogram_u8 } = await loadNative('examples/histogram.c', { isolation: 'worker' });

    const data = new Uint8Array([0, 1, 1, 2, 2, 2, 255]);
  const out = new Uint32Array(256);

  // With typed pointers enabled (`uint32_t*` -> `pointer<uint32_t>`), koffi can
  // marshal a Uint32Array directly.
  await histogram_u8(data, data.length, out);

    expect(out[0]).toBe(1);
    expect(out[1]).toBe(2);
    expect(out[2]).toBe(3);
    expect(out[255]).toBe(1);
  }, 60_000);
});
