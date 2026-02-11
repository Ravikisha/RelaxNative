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

    // Prevent silent mis-marshalling for pointer-to-pointer.
    // Relaxnative doesn't currently allocate nested pointer graphs from JS.
    if (
      fn.args.some(
        (t) => typeof t === 'string' && /^pointer\s*<\s*pointer\s*<.+>\s*>\s*$/i.test(t),
      )
    ) {
      throw new Error(
        `Unsupported native signature for ${fn.name}: pointer-to-pointer types (e.g. int**) are not supported yet. ` +
          `Please write a wrapper that flattens the data (and pass a single pointer + sizes).`,
      );
    }

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
      const mapped = args.map((a, i) => {
        const spec = fn.args[i];

        // Convenience: allow passing a plain JS array for pointer<int>/pointer<uint32_t>/etc.
        // We marshal to a TypedArray so koffi can pass it as a typed pointer.
        if (Array.isArray(a) && typeof spec === 'string') {
          const isPtr = /^pointer\s*<.+>$/i.test(spec);
          if (isPtr) {
            const inner = spec
              .replace(/^pointer\s*<\s*/i, '')
              .replace(/\s*>\s*$/i, '')
              .trim();

            switch (inner) {
              case 'int':
              case 'int32_t':
                return Int32Array.from(a);
              case 'uint32_t':
                return Uint32Array.from(a);
              case 'uint8_t':
                return Uint8Array.from(a);
              case 'int8_t':
                return Int8Array.from(a);
              case 'uint16_t':
                return Uint16Array.from(a);
              case 'int16_t':
                return Int16Array.from(a);
              case 'float':
                return Float32Array.from(a);
              case 'double':
                return Float64Array.from(a);
              default:
                // Fall through: koffi might accept arrays for void*, but it's inconsistent.
                break;
            }
          }
        }

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
