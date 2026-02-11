import koffi from 'koffi';

import type { FfiBindings } from './ffiTypes.js';
import { mapType } from './typeMap.ts';
import { NativeBuffer } from '../memory/NativeBuffer.ts';
import { NativePointer } from '../memory/NativePointer.ts';
import { allocRaw } from '../memory/nativeMemory.ts';

function isSerializedNativeBuffer(v: any): v is { address: number; size: number } {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof v.address === 'number' &&
    typeof v.size === 'number' &&
    v.size >= 0
  );
}

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
      // Keep temporary pointer tables alive for the duration of the call.
      // These are only used when the caller passes a "2D" array into a pointer-to-pointer arg.
      const tmpPointerTables: Array<{ handle: any; view: Uint8Array }> = [];

      const mapped = args.map((a, i) => {
        const spec = fn.args[i];

        // pointer<pointer<T>> (e.g. int**): allow passing a JS "array of rows".
        // The contract is:
        // - outer array length = number of rows
        // - each row can be: TypedArray, NativeBuffer, NativePointer, or number[] (converted)
        // We allocate a temporary native table of pointers (void**) and pass that.
        if (
          typeof spec === 'string' &&
          /^pointer\s*<\s*pointer\s*<.+>\s*>\s*$/i.test(spec)
        ) {
          if (!Array.isArray(a)) {
            return a;
          }

          // Convert each row to a koffi pointer value.
          // - NativeBuffer -> External handle from koffi.alloc (safe)
          // - NativePointer -> numeric address
          const rowPtrs: any[] = a.map((row: any) => {
            if (NativeBuffer.isNativeBuffer(row)) return row.toKoffiPointer();
            if (NativePointer.isNativePointer(row)) return row.toKoffiPointer();

            // Process isolation: NativeBuffer instances are structured-cloned and lose their prototype/brand.
            // In that case, accept a {address,size} object and rebuild a temporary external handle.
            if (isSerializedNativeBuffer(row)) {
              // Allocate a new buffer of the same size and copy nothing (caller controls contents).
              // This is best-effort and mainly intended for pointer tables where the native code only reads pointers,
              // not the row contents.
              const tmp = allocRaw(row.size);
              tmpPointerTables.push(tmp);
              return tmp.handle;
            }
            if (ArrayBuffer.isView(row) || Array.isArray(row)) {
              throw new TypeError(
                `Unsupported row value for ${fn.name} arg[${i}] (pointer-to-pointer): row must be a NativeBuffer or NativePointer. ` +
                  `TypedArray/number[] rows don't expose a stable native address for building a T** table. ` +
                  `Use native.alloc() per row and pass the row buffers instead.`,
              );
            }

            throw new TypeError(
              `Unsupported row value for ${fn.name} arg[${i}] (pointer-to-pointer): expected NativeBuffer|NativePointer`,
            );
          });

          // Allocate a native pointer table (void**) and write pointer values.
          // koffi.sizeof('pointer') isn't available on all builds.
          // Use Node's architecture as a reliable fallback.
          const ptrSize = process.arch.includes('64') ? 8 : 4;
          const table = allocRaw(rowPtrs.length * ptrSize);
          const dv = new DataView(table.view.buffer, table.view.byteOffset, table.view.byteLength);
          for (let r = 0; r < rowPtrs.length; r++) {
            const off = r * ptrSize;

            const rawPtr = rowPtrs[r];
            const addrRaw = koffi.address(rawPtr as any) as unknown;
            const addr = typeof addrRaw === 'bigint' ? Number(addrRaw) : (addrRaw as number);
            if (!Number.isFinite(addr) || addr === 0) {
              throw new TypeError(
                `Failed to take address of row[${r}] for ${fn.name} arg[${i}] (pointer-to-pointer)`,
              );
            }

            if (ptrSize === 8) dv.setBigUint64(off, BigInt(addr), true);
            else dv.setUint32(off, addr >>> 0, true);
          }
          tmpPointerTables.push(table);

          // Pass the pointer to the start of the table as the External handle.
          // This matches how koffi expects pointer arguments ("external pointer").
          return table.handle;
        }

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

      // Cleanup temp pointer tables.
      // These are JS-owned native allocations for building void** tables.
      for (const t of tmpPointerTables) {
        try {
          koffi.free(t.handle as any);
        } catch {
          // ignore
        }
      }

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
