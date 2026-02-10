// Minimal self-test runner for native memory + buffer FFI.
// This intentionally avoids Vitest because some environments crash when
// running koffi inside Vitest worker pools.

import { strict as assert } from 'node:assert';

import { loadNative } from '../loader.js';
import { alloc } from './index.js';

async function main() {
  const buf = alloc(16);
  assert.equal(buf.size, 16);

  buf.write(new Uint8Array([1, 2, 3, 4]));
  assert.equal(buf.toUint8Array()[0], 1);

  // FFI smoke test
  const mod = await loadNative('examples/buffer.c');
  assert.equal(typeof (mod as any).fill_u8, 'function');
  assert.equal(typeof (mod as any).sum_u8, 'function');

  (mod as any).fill_u8(buf, buf.size, 7);
  const sum = (mod as any).sum_u8(buf, buf.size);
  assert.equal(sum, 112);

  buf.free();

  console.log('memory selftest: ok');
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
