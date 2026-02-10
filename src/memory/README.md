# Native Memory Management (experimental)

Relaxnative can call native functions via koffi. Returning JS primitives is safe, but **heap allocations** (buffers / strings / structs) require explicit ownership + lifetime rules.

This module provides JS-managed wrappers around native memory.

## Core abstractions

- `NativeBuffer`:
  - owns a chunk of native memory allocated by Relaxnative (`native.alloc()`)
  - knows its `address` and `size`
  - supports `.write()` + `.toUint8Array()`
  - supports `.free()` and detects double-free / use-after-free

- `NativePointer`:
  - non-owning opaque pointer (`address`) with optional `size`
  - cannot be freed by JS (allocator unknown)
  - intended for native-owned pointers returned from APIs

## Allocation & free

```ts
import { native } from 'relaxnative';

const buf = native.alloc(1024);
// pass to native functions expecting `unsigned char*` / `uint8_t*`
native.free(buf); // or: buf.free()
```

Optional finalization:

```ts
const buf = native.alloc(1024, { autoFree: true });
```

This uses `FinalizationRegistry` as best-effort cleanup. It is **not deterministic**.

## Ownership rules

- **JS-owned** (`ownership: 'js'`):
  - allocated via `native.alloc()`
  - must be freed by JS (`buf.free()`)
  - can be auto-freed via GC finalization (best-effort)

- **Native-owned** (`ownership: 'native'`):
  - returned by native code or provided by external libraries
  - must **not** be freed by JS

## FFI integration

When Relaxnative bindings see a pointer-like arg (`buffer`, `pointer`, `pointer<T>`), you can pass:

- `NativeBuffer`
- `NativePointer`
- a `Uint8Array` / Node `Buffer` (we pass its address)

Relaxnative unwraps these to numeric addresses before invoking koffi.

## Safety guarantees (best-effort)

- Detect double-free on `NativeBuffer`
- Detect use-after-free on most `NativeBuffer` accessors
- Guard against null pointer addresses when constructing `NativePointer`

Limitations:

- A `NativePointer` cannot be freed, because the allocator is unknown.
- If you pass a raw numeric address, no lifetime tracking is possible.
