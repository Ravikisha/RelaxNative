export * from './memoryTypes.js';
export * from './NativeBuffer.js';
export * from './NativePointer.js';
export * from './nativeMemory.js';

import { NativeBuffer } from './NativeBuffer.js';
import { NativePointer } from './NativePointer.js';
import { allocRaw } from './nativeMemory.js';
import { InvalidFreeError } from './memoryTypes.js';

/**
 * High-level user-facing API.
 */
export function alloc(size: number, opts?: { autoFree?: boolean }): NativeBuffer {
  const allocation = allocRaw(size);
  return new NativeBuffer(allocation, { ownership: 'js', autoFree: opts?.autoFree });
}

export function free(ptr: NativeBuffer | NativePointer) {
  if (NativeBuffer.isNativeBuffer(ptr)) {
    ptr.free();
    return;
  }

  if (NativePointer.isNativePointer(ptr)) {
    // We don't allow freeing arbitrary pointers because we don't know their allocator.
    // Only NativeBuffer (allocated by koffi.alloc) can be freed safely.
    throw new InvalidFreeError(
      `native.free(ptr): cannot free a raw NativePointer (unknown allocator). Use a NativeBuffer allocated by native.alloc().`,
    );
  }

  throw new TypeError('native.free(ptr): expected NativeBuffer or NativePointer');
}
