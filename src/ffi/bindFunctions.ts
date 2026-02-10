import koffi from 'koffi';

import type { FfiBindings } from './ffiTypes.js';
import { mapType } from './typeMap.ts';
import { NativeBuffer } from '../memory/NativeBuffer.ts';
import { NativePointer } from '../memory/NativePointer.ts';

export function bindFunctions(
  lib: any,
  bindings: FfiBindings,
): Record<string, Function> {
  const exports: Record<string, Function> = {};

  const functions = Array.isArray(bindings.functions)
    ? bindings.functions
    : Object.values(bindings.functions);

  for (const fn of functions) {
    if (!fn?.name || !fn?.returns || !Array.isArray(fn?.args)) {
      throw new Error(
        `Invalid FFI binding entry: ${JSON.stringify(fn)}. Expected {name, returns, args[]}.`,
      );
    }

    const returns = mapType(fn.returns);
    const args = fn.args.map(mapType);

    // Fail fast with a clear message instead of letting koffi throw
    // "Unexpected Undefined value as type specifier".
    if (!returns) {
      throw new Error(
        `FFI type mapping returned undefined for return type ${JSON.stringify(fn.returns)} (fn=${fn.name})`,
      );
    }
    for (let i = 0; i < args.length; i++) {
      if (!args[i]) {
        throw new Error(
          `FFI type mapping returned undefined for arg[${i}] type ${JSON.stringify(fn.args[i])} (fn=${fn.name})`,
        );
      }
    }

    if (process.env.RELAXNATIVE_DEBUG_FFI === '1') {
      // eslint-disable-next-line no-console
      console.log('[relaxnative ffi] bind', fn.name, { returns: fn.returns, args: fn.args });
    }

  const raw = lib.func(fn.name, returns, args);

    // Wrap to support NativeBuffer/NativePointer args.
    exports[fn.name] = (...args: any[]) => {
      const mapped = args.map((a) => {
        if (NativeBuffer.isNativeBuffer(a)) return a.toKoffiPointer();
        if (NativePointer.isNativePointer(a)) return a.toKoffiPointer();
  // Also accept TypedArrays directly.
  // Note: avoid converting to a numeric address (can segfault);
  // pass the view through so koffi can marshal the pointer.
  if (ArrayBuffer.isView(a)) return a;
        return a;
      });
      const out = raw(...mapped);

      // Return-pointer support.
      // If the binding says the function returns a pointer-like value, wrap it.
      // Note: for now we treat these as borrowed pointers (unknown allocator).
      if (fn.returns === 'pointer' || /^pointer\s*<.+>$/i.test(fn.returns)) {
        if (out == null) return out;
  const rawAddr = out as any;
  const addr = typeof rawAddr === 'bigint' ? Number(rawAddr) : (rawAddr as number);
  return new NativePointer({ address: addr, ownership: 'borrowed' });
      }

      return out;
    };
  }

  return exports;
}
