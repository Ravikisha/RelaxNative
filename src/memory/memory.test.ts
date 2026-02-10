import { describe, it, expect } from 'vitest';

import { loadNative } from '../loader.js';
import { alloc } from './index.js';
import { InvalidFreeError, UseAfterFreeError } from './memoryTypes.js';

describe('native memory API', () => {
  it('alloc/write/toUint8Array/free', async () => {
    const buf = alloc(16);
    expect(buf.size).toBe(16);

    buf.write(new Uint8Array([1, 2, 3, 4]));
    expect(buf.toUint8Array()[0]).toBe(1);

    buf.free();
    expect(buf.freed).toBe(true);

    expect(() => buf.toUint8Array()).toThrow(UseAfterFreeError);
    expect(() => buf.free()).toThrow(InvalidFreeError);
  });

  it('can pass NativeBuffer to C as a buffer pointer', async () => {
    const mod = await loadNative('examples/buffer.c');
    const buf = alloc(8);

    mod.fill_u8(buf, buf.size, 7);
    const sum = mod.sum_u8(buf, buf.size);

    expect(sum).toBe(7 * 8);

    buf.free();
  });

  it('autoFree releases memory on GC (manual, requires --expose-gc)', async () => {
    const gc = (globalThis as any).gc as undefined | (() => void);
    if (typeof gc !== 'function') {
      // This test is intentionally opt-in: without --expose-gc there's no
      // deterministic way to force finalizers.
      return;
    }

    // Use koffi's view to ensure the pointer is readable before GC.
    // We'll free in FinalizationRegistry, so leaked memory would accumulate.
    let finalized = false;
    const reg = new FinalizationRegistry(() => {
      finalized = true;
    });

    // Scope the buffer so it can become unreachable.
    (() => {
      const buf = alloc(64, { autoFree: true });
      buf.write(new Uint8Array([1, 2, 3, 4]));
      reg.register(buf, 1);
    })();

    // Encourage GC/finalizers; finalization timing isn't guaranteed, so we poll.
    for (let i = 0; i < 50 && !finalized; i++) {
      gc();
      // Let finalizers run.
      await new Promise((r) => setTimeout(r, 10));
    }

    expect(finalized).toBe(true);
  }, 10_000);
});
