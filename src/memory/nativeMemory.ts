import koffi from 'koffi';

/**
 * Low-level process memory primitives.
 *
 * Notes:
 * - This uses koffi's built-in allocator so we don't need a bespoke native shim.
 * - Returned pointers are *opaque* JS numbers (addresses). Wrap them in
 *   NativePointer/NativeBuffer for safety checks + ownership tracking.
 */

export type NativeAddress = number;

export type RawAllocation = {
  handle: any;
  view: Uint8Array;
};

export function allocRaw(size: number): RawAllocation {
  if (!Number.isInteger(size) || size <= 0) {
    throw new TypeError(`native.alloc(size): size must be a positive integer, got ${size}`);
  }

  // koffi allocates native memory and returns an External handle.
  // We expose a Uint8Array view for read/write.
  const handle = koffi.alloc('char', size);
  const ab = koffi.view(handle, size) as ArrayBuffer;
  const view = new Uint8Array(ab);
  return { handle, view };
}

export function freeRaw(ptr: unknown) {
  // koffi.free() accepts the buffer returned by koffi.alloc().
  // freeing a number address isn't supported by koffi and would be unsafe.
  koffi.free(ptr as any);
}
