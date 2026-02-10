<!-- markdownlint-disable MD033 -->

<p align="center">
  <img src="https://ravikisha.github.io/assets/relaxnative.png" width="400" alt="Relaxnative logo" />
</p>

<h1 align="center">Relaxnative</h1>

<p align="center">
  Native C/C++/Rust for Node.js with zero-config compilation, caching, isolation modes, and a supply-chain trust system for third‑party native packages.
</p>

<p align="center">
  <a href="https://github.com/Ravikisha/RelaxNative">GitHub</a>
  ·
  <a href="#quickstart">Quickstart</a>
  ·
  <a href="#annotations">Annotations</a>
  ·
  <a href="#cli">CLI</a>
  ·
  <a href="#registry-relaxregistry">RelaxRegistry</a>
  ·
  <a href="#express-example">Express example</a>
</p>

---

## What you get

- **Compile-on-demand**: import a `.c`/`.cpp`/`.rs` file and call exported functions.
- **Deterministic cache**: native builds are cached and re-used.
- **Isolation modes**:
  - `in-process` (fastest) - this mode runs native code in the same thread as the JavaScript code, providing the lowest overhead but also the least isolation.
  - `worker` (async dispatch via worker threads) - this mode runs native code in a separate worker thread, providing better isolation at the cost of some overhead.
  - `process` (crash isolation + best-effort runtime safety guards) - this mode runs native code in a separate process, providing the highest level of isolation but also the highest overhead.
- **RelaxRegistry packages**: install native “packages” into `native/registry/`.
- **Supply-chain trust levels** for registry packages: `local`, `community`, `verified`.

> Native code is inherently unsafe. Isolation and guards help, but they’re not a perfect sandbox.

---

## Installation

```bash
npm i relaxnative
```

Requirements:
- Node.js >= 18
- A C compiler (clang or gcc). Rust optional (rustc + cargo).

---

## Quickstart

### 1) Create a native file

`native/add.c`

```c
// @sync
int add(int a, int b) {
  return a + b;
}
```

### 2) Import and call it from JS/TS

```ts
import { loadNative } from 'relaxnative';

const mod = await loadNative('native/add.c', { isolation: 'worker' });
console.log(mod.add(1, 2));
```

---

## API

### `loadNative(sourcePath, options?)`

```ts
import { loadNative } from 'relaxnative';

const mod = await loadNative('native/add.c', {
  isolation: 'worker',
  config: {
    functionMode: { add: 'sync' },
    defaultMode: 'sync',
  },
});
```

Options:
- `isolation?: 'in-process' | 'worker' | 'process'`
- `config?: { functionMode?: Record<string, 'sync'|'async'>; defaultMode?: 'sync'|'async' }`

Notes:
- Default isolation is `worker`.
- In `process` isolation, calls are IPC-based and therefore async.

### Native memory helpers

```ts
import { native } from 'relaxnative';

const buf = native.alloc(1024);
buf.write(Uint8Array.from([1, 2, 3]));
console.log(buf.address); // numeric pointer
```

---

## Isolation modes

### `in-process`
- fastest
- unsafe: native crashes take down your Node process

### `worker`
- worker-thread dispatch for async calls
- sync calls may execute directly for low overhead

### `process`
- forked helper process
- crash containment
- best-effort Node runtime guards (module import denial for fs/network/spawn)
- call timeout enforcement (kills helper)

---

## Annotations

Relaxnative reads annotations from up to **3 lines above** a function definition.

Supported:
- `@sync`
- `@async`
- `@cost low|medium|high`

### What annotations mean

- `@sync`
  - The JS wrapper returns a plain value.
  - In `worker` isolation, this may still execute on the main thread for low overhead.
  - Best for quick, safe-ish functions (or when you explicitly accept crash risk in `in-process`).
- `@async`
  - The JS wrapper returns a `Promise`.
  - In `worker` isolation, the call always goes through a worker thread.
  - Best for CPU-heavy work where you don't want to block the event loop.
- `@cost low|medium|high`
  - A hint used for readability and future scheduling heuristics.
  - Today it doesn't change performance by itself, but it's useful documentation.

### C/C++ example

```c
// @async
// @cost high
int heavy(int n) {
  long x = 0;
  for (int i = 0; i < n * 10000000; i++) x += i;
  return (int)x;
}
```

### Rust example

```rust
// @sync
#[no_mangle]
pub extern "C" fn add(a: i32, b: i32) -> i32 {
    a + b
}
```

---

## Types & FFI contract

Relaxnative parses your function signatures and maps them to FFI types.
This is intentionally conservative: **if we don't recognize a type, we fail fast**.

### Core rule of thumb

- **Scalars** (like `int`, `double`, `uint32_t`) map to JS `number`.
- **Pointers** (like `double*`, `uint32_t*`) map to one of:
  - a **TypedArray** (preferred when available)
  - a numeric **address** (advanced; obtained via `native.alloc(...).address`)

### Supported scalar C types (common)

- `int`, `unsigned int`
- `float`, `double`
- `long` (treated as 64-bit)
- `size_t`
- fixed-width ints: `int8_t`, `uint8_t`, `int16_t`, `uint16_t`, `int32_t`, `uint32_t`, `int64_t`, `uint64_t`

### Supported pointer forms

- `uint8_t*` / `unsigned char*` treated as **byte buffers**
  - Pass a `Uint8Array` (recommended)
  - Or pass a numeric pointer from `native.alloc()`
- Typed pointers: `uint32_t*` becomes `pointer<uint32_t>` internally
  - Pass a `Uint32Array` directly

### Strings

- `const char*` parameters are treated as **cstring**.
  - JS side: pass a JS `string`.
- `char*`/`const char*` returns are treated as cstring.
  - JS side: expect a JS `string`.

### Example: buffer in + buffer out

```c
// @sync
void xor_u8(const uint8_t* a, const uint8_t* b, uint8_t* out, int n) {
  for (int i = 0; i < n; i++) out[i] = a[i] ^ b[i];
}
```

```ts
import { loadNative } from 'relaxnative';

const { xor_u8 } = await loadNative('native/xor.c', { isolation: 'worker' });
const a = new Uint8Array(1024);
const b = new Uint8Array(1024);
const out = new Uint8Array(1024);
xor_u8(a, b, out, out.length);
```

### Example: histogram output (typed pointer)

```c
// @async
void histogram_u8(const uint8_t* data, int n, uint32_t* out256) {
  for (int i = 0; i < 256; i++) out256[i] = 0;
  for (int i = 0; i < n; i++) out256[data[i]]++;
}
```

```ts
import { loadNative } from 'relaxnative';

const { histogram_u8 } = await loadNative('native/histogram.c', { isolation: 'worker' });
const data = new Uint8Array(1024 * 1024);
const out = new Uint32Array(256);
await histogram_u8(data, data.length, out);
```

If you see a type error like `Unexpected Uint32Array value, expected number`, it usually means the C signature was parsed as a generic pointer instead of a typed pointer. Prefer fixed-width types like `uint32_t*`.

---

## When to use Relaxnative (good fits)

Relaxnative shines when you have **large batches** of work and the native call does enough computation to amortize the FFI overhead.

Good fits:
- CPU-bound kernels on large arrays (SIMD-able loops)
  - image/audio primitives, DSP, analytics kernels, checksums/hashing
- tight numeric loops (matmul-ish, dot, saxpy) where JS becomes the bottleneck
- code you already have in C/C++/Rust and want to reuse from Node
- isolating risky/3rd-party native code in `process` mode with best-effort guards

### When *not* to use it (bad fits)

Avoid Relaxnative when:
- you're calling a native function **many times with tiny inputs** (per-call overhead dominates)
- the work is IO-bound (files/network); native won't magically make IO faster
- you need a strict sandbox (process guards are **not** a syscall-enforced sandbox)
- your function depends on complex C structs/callbacks (today's type support is intentionally small)
- the native code isn't deterministic/pure and can corrupt process memory

---

## CLI

```bash
npx relaxnative --help
```

### Diagnostics

```bash
npx relaxnative doctor
```

### Native test harness

```bash
npx relaxnative test native/examples --isolation worker
npx relaxnative test native/examples --isolation process
```

Test signatures:
- `int test_name()` → `0` pass, non‑zero fail
- `const char* test_name()` → `NULL`/"" pass, non‑empty message fail

### Benchmarks

```bash
npx relaxnative bench examples/add.c add --traditional
npx relaxnative bench examples/loop.c loop_sum --traditional --iterations 5 --warmup 1
npx relaxnative bench examples/buffer.c sum_u8 --traditional --iterations 3 --warmup 1
npx relaxnative bench examples/dot.c dot_f64 --traditional --iterations 2 --warmup 1
npx relaxnative bench examples/saxpy.c saxpy_f64 --traditional --iterations 1 --warmup 1
npx relaxnative bench examples/matmul.c matmul_f32 --traditional --iterations 1 --warmup 1
npx relaxnative bench examples/xor.c xor_u8 --traditional --iterations 1 --warmup 1
npx relaxnative bench examples/crc32.c crc32_u8 --traditional --iterations 1 --warmup 1
```

Additional built-in demo baselines are provided for:
- `dot_f64` (dot product)
- `saxpy_f64` (vector kernel)
- `matmul_f32` (naive matrix multiply)
- `xor_u8` (buffer XOR)
- `crc32_u8` (checksum)
- `histogram_u8` (analytics/image primitive)

#### Benchmark results:

1. A Simple Vector Kernal
```bash
❯ npx relaxnative bench examples/saxpy.c saxpy_f64 --traditional --iterations 1 --warmup 1
traditional-js (baseline)
  iterations: 1 (warmup 1)
  calls/sec:   49.636
  avg ms:      19.818
  min ms:      19.818
  max ms:      19.818

Speedup vs baseline (higher is better)
  sync:   364.94x
  worker: 368.56x

saxpy_f64 (sync)
  iterations: 1 (warmup 1)
  calls/sec:   18114.301
  avg ms:      0.036
  min ms:      0.036
  max ms:      0.036

saxpy_f64 (worker)
  iterations: 1 (warmup 1)
  calls/sec:   18293.575
  avg ms:      0.025
  min ms:      0.025
  max ms:      0.025
```

2. Matrix Multiplication
```bash
❯ npx relaxnative bench examples/matmul.c matmul_f32 --traditional --iterations 1 --warmup 1
traditional-js (baseline)
  iterations: 1 (warmup 1)
  calls/sec:   5.829
  avg ms:      171.228
  min ms:      171.228
  max ms:      171.228

Speedup vs baseline (higher is better)
  sync:   1240.74x
  worker: 2710.71x

matmul_f32 (sync)
  iterations: 1 (warmup 1)
  calls/sec:   7232.070
  avg ms:      0.112
  min ms:      0.112
  max ms:      0.112

matmul_f32 (worker)
  iterations: 1 (warmup 1)
  calls/sec:   15800.284
  avg ms:      0.025
  min ms:      0.025
```

### Cache

```bash
npx relaxnative cache status
npx relaxnative cache clean
```

---

## Registry (RelaxRegistry)

Install local packages (offline, deterministic):

```bash
npx relaxnative add file:examples/registry/fast-matrix
npx relaxnative list
npx relaxnative remove fast-matrix
```

### Trust levels

`relax.json`:

- `trust: "local" | "community" | "verified"`

Behavior:
- `local` → trusted, no prompts
- `community` → warnings + confirmation (only once; decision saved in `native/registry/.trust.json`)
- `verified` → silent install, requires `registrySignature`

### Verified signature

```json
{
  "trust": "verified",
  "registrySignature": { "alg": "sha256", "digest": "..." }
}
```

Digest is computed over `relax.json` with `registrySignature` removed.

---

## Express example

```bash
mkdir my-app
cd my-app
npm init -y
npm i express relaxnative
```

`native/loop.c`

```c
// @sync
long loop_sum(long n) {
  long x = 0;
  for (long i = 0; i < n; i++) x += i;
  return x;
}
```

`server.mjs`

```js
import express from 'express';
import { loadNative } from 'relaxnative';

const app = express();
const native = await loadNative('native/loop.c', { isolation: 'worker' });

app.get('/sum', (req, res) => {
  const n = Number(req.query.n ?? 1_000_000);
  res.json({ n, v: native.loop_sum(n) });
});

app.listen(3000, () => console.log('http://localhost:3000'));
```

---

## Developer documentation

High-level structure:
- `src/loader.ts` — compile + parse + bind + wrap
- `src/compiler/*` — compiler detection + cached compilation
- `src/parser/*` — Tree-sitter parsing + annotations
- `src/ffi/*` — koffi binding generation
- `src/worker/*` — worker/process isolation
- `src/registry/*` — registry installer + trust enforcement

Debug flags:
- `RELAXNATIVE_DEBUG=1`
- `RELAXNATIVE_TRACE=1` (prints extra call tracing; useful for debugging segfaults)

---

## LLM Prompt (Architecture + code generation)

Copy/paste this prompt into ChatGPT / Claude / Copilot Chat when you want the model to plan and scaffold an app using Relaxnative.

### Prompt

You are a **Senior Node.js + Native Systems Engineer**.

I’m using the **Relaxnative** library for Node.js, which provides:
- `loadNative(path, { isolation })` to compile+load `.c/.cpp/.rs`
- isolation modes: `in-process`, `worker`, `process`
- native annotations: `@sync`, `@async`, `@cost low|medium|high`
- a CLI (`relaxnative doctor/test/bench/cache/add/list/remove`)
- RelaxRegistry packages with supply-chain trust levels: `local`, `community`, `verified`
- a small runtime safety guard layer in `process` isolation for permissions/timeouts

You must follow these rules:
- Prefer **fixed-width types** in C signatures (`uint32_t`, `uint8_t`, etc.) to avoid ambiguity.
- For bulk data, prefer **TypedArrays** (`Uint8Array`, `Float64Array`, `Uint32Array`) over lists.
- Avoid tiny-call micro-optimizations; solve performance by batching and reducing call count.
- If you can crash Node (native code!), default to `isolation: 'process'` during development.

**My question/problem:**
<PASTE YOUR PROBLEM HERE>

#### Your output must include:

1) **Feasibility & fit**
  - Is this a good use case for Relaxnative? If no, explain briefly and propose a safer alternative.
  - Identify which parts should remain in JS and which should become native.

2) **Isolation + security defaults**
  - Choose an isolation mode and justify it.
  - If 3rd-party code is involved, use `process` isolation and explain trust levels.
  - Propose a `relax.json` permissions/limits policy if packaging a RelaxRegistry module.

3) **Native API design contract**
  - Function signatures (C or Rust) with types suitable for FFI.
  - How data buffers/arrays are passed (TypedArray ↔ pointer address / NativeBuffer).
  - Error-handling strategy (return codes, sentinel values, etc.).

4) **Implementation plan**
  - Step-by-step tasks (files to create, where they live).
  - A minimal working prototype first, then optimizations.

5) **Code generation**
  - Provide:
    - native source file(s) with Relaxnative annotations
    - the Node/TS loader code using `loadNative()`
    - a benchmark command using `npx relaxnative bench ... --traditional`
    - optional: a test using Vitest

6) **Performance checklist**
  - Specify what to measure and how.
  - Identify what sizes/iteration counts are needed to overcome FFI overhead.

Constraints:
- Use ESM syntax.
- Prefer deterministic builds and offline-friendly behavior.
- Keep the first version simple and correct.

### Minimal copy/paste prompt (for ChatGPT / Claude)

Paste this when you want an LLM to generate a Relaxnative kernel:

> You are a Senior Node.js + C/Rust engineer. Generate a Relaxnative native kernel.
> 
> Requirements:
> - Provide a `.c` (or `.rs`) file with exported functions.
> - Use annotations on the 1 lines above each function: `@sync`/`@async` and `@cost low|medium|high`.
> - Use fixed-width C types where possible: `uint8_t`, `uint32_t`, `int32_t`, etc.
> - For buffers, use `uint8_t*` and pass `Uint8Array` from JS.
> - For `uint32_t*` outputs, pass `Uint32Array` from JS.
> - Provide a Node ESM usage snippet using `loadNative(path, { isolation: 'worker' })`.
> - Provide a benchmark command using: `npx relaxnative bench <file> <fn> --traditional`.
> - Include a quick correctness test (Vitest preferred).
> Example:
> ```ts
> import { loadNative } from 'relaxnative';
>
> const { add } = await loadNative('./add.so', { isolation: 'worker' });
>
> // Test the native function
> test('add', () => {
>   expect(add(1, 2)).toBe(3);
> });
> ```
>
>```c
> #include <stdint.h>
>
> // Example native function
> @sync @cost low
> uint32_t add(uint32_t a, uint32_t b) {
>   return a + b;
> }
>
>```



---

## Support ☕

If you found this project helpful, consider buying me a coffee!

[![Buy Me A Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://www.buymeacoffee.com/ravikisha)

## License

MIT © Ravi Kishan [Portfolio](https://www.ravikishan.me)