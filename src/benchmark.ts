import { loadNative } from './loader.js';
import { alloc } from './memory/index.js';

function isTraceEnabled() {
  return process.env.RELAXNATIVE_TRACE === '1';
}

function trace(...args: any[]) {
  if (!isTraceEnabled()) return;
  // eslint-disable-next-line no-console
  console.log('[relaxnative:trace]', ...args);
}

export type BenchmarkOptions = {
  iterations?: number;
  warmup?: number;
  mode?: 'sync' | 'worker';
  /**
   * Arguments to pass to the benchmarked function.
   * If omitted, we try a small default based on arity (0 args => [], else => [1,2]).
   */
  args?: any[];
  json?: boolean;
  confirmExpensive?: boolean;
};

export type BenchmarkResult = {
  fnName: string;
  mode: 'sync' | 'worker';
  iterations: number;
  warmup: number;
  callsPerSec: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
};

export type TraditionalBenchmarkResult = {
  name: string;
  iterations: number;
  warmup: number;
  callsPerSec: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
};

function nowNs() {
  return process.hrtime.bigint();
}

function nsToMs(ns: bigint) {
  return Number(ns) / 1e6;
}

function assertSafeRun(iterations: number) {
  // Hard safety cap unless explicitly confirmed.
  if (iterations > 2_000_000) {
    throw new Error(
      `Refusing to run benchmark with iterations=${iterations} (cap=2,000,000). Pass a smaller value.`,
    );
  }
}

export async function benchmarkJsFunction(
  name: string,
  fn: (...args: any[]) => any,
  opts?: { iterations?: number; warmup?: number; args?: any[] },
): Promise<TraditionalBenchmarkResult> {
  const iterations = opts?.iterations ?? 100_000;
  const warmup = opts?.warmup ?? Math.min(10_000, Math.max(100, Math.floor(iterations * 0.05)));
  assertSafeRun(iterations);

  const args = Array.isArray(opts?.args) ? opts!.args : fn.length === 0 ? [] : [1, 2];

  // Warmup
  for (let i = 0; i < warmup; i++) {
    const out = fn(...args);
    if (out instanceof Promise) await out;
  }

  const latencies: number[] = [];
  const startAll = nowNs();
  for (let i = 0; i < iterations; i++) {
    const t0 = nowNs();
    const out = fn(...args);
    if (out instanceof Promise) await out;
    const t1 = nowNs();
    latencies.push(nsToMs(t1 - t0));
  }
  const endAll = nowNs();
  const totalMs = nsToMs(endAll - startAll);

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const l of latencies) {
    if (l < min) min = l;
    if (l > max) max = l;
    sum += l;
  }

  const avg = sum / latencies.length;
  const callsPerSec = iterations / (totalMs / 1000);

  return {
    name,
    iterations,
    warmup,
    callsPerSec,
    avgLatencyMs: avg,
    minLatencyMs: min,
    maxLatencyMs: max,
  };
}

type BaselineSpec = {
  name: string;
  fn: (...args: any[]) => any;
  defaultArgs: any[];
};

function getBuiltInBaseline(fnName: string): BaselineSpec | null {
  if (fnName === 'add') {
    return {
      name: 'traditional-js',
      fn: (a: number, b: number) => a + b,
      defaultArgs: [1, 2],
    };
  }

  // CPU-bound loop example (examples/loop.c)
  if (fnName === 'loop_sum') {
    return {
      name: 'traditional-js',
      fn: (n: number) => {
        let acc = 0;
        for (let i = 0; i < n; i++) {
          acc += (i ^ 0x9e3779b9) & 0xffff;
        }
        return acc;
      },
      // default to a CPU-heavy iteration count so native has a chance to win
      defaultArgs: [50_000_000],
    };
  }

  // Big-buffer sum example (examples/buffer.c)
  if (fnName === 'sum_u8') {
    return {
      name: 'traditional-js',
      fn: (buf: Uint8Array, n: number) => {
        let s = 0;
        for (let i = 0; i < n; i++) s += buf[i];
        return s;
      },
  // Default to 16MB to keep CI stable and still demonstrate buffer-heavy work.
  defaultArgs: [new Uint8Array(16 * 1024 * 1024).fill(1), 16 * 1024 * 1024],
    };
  }

  // Dot product example (examples/dot.c)
  if (fnName === 'dot_f64') {
  const n = 3_000_000; // ~24MB total across two arrays
    const a = new Float64Array(n);
    const b = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      a[i] = (i % 1024) * 0.001;
      b[i] = (i % 2048) * 0.002;
    }
    return {
      name: 'traditional-js',
      fn: (aa: Float64Array, bb: Float64Array, nn: number) => {
        let acc = 0;
        for (let i = 0; i < nn; i++) acc += aa[i] * bb[i];
        return acc;
      },
      defaultArgs: [a, b, n],
    };
  }

  // SAXPY example (examples/saxpy.c)
  if (fnName === 'saxpy_f64') {
  const n = 3_000_000; // ~24MB per array
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = (i % 1024) * 0.001;
      y[i] = (i % 2048) * 0.002;
    }
    const a = 1.0001;
    return {
      name: 'traditional-js',
      fn: (aa: number, xx: Float64Array, yy: Float64Array, nn: number) => {
        for (let i = 0; i < nn; i++) yy[i] = aa * xx[i] + yy[i];
        return yy[0];
      },
      defaultArgs: [a, x, y, n],
    };
  }

  // Naive matmul example (examples/matmul.c)
  if (fnName === 'matmul_f32') {
    const M = 256;
    const K = 256;
    const N = 256;
    const A = new Float32Array(M * K);
    const B = new Float32Array(K * N);
    const C = new Float32Array(M * N);
    for (let i = 0; i < A.length; i++) A[i] = (i % 13) * 0.01;
    for (let i = 0; i < B.length; i++) B[i] = (i % 7) * 0.02;
    return {
      name: 'traditional-js',
      fn: (a: Float32Array, b: Float32Array, c: Float32Array, m: number, k: number, n: number) => {
        for (let i = 0; i < m; i++) {
          for (let j = 0; j < n; j++) {
            let acc = 0;
            for (let kk = 0; kk < k; kk++) acc += a[i * k + kk] * b[kk * n + j];
            c[i * n + j] = acc;
          }
        }
        return c[0];
      },
      defaultArgs: [A, B, C, M, K, N],
    };
  }

  // XOR example (examples/xor.c)
  if (fnName === 'xor_u8') {
  const n = 4 * 1024 * 1024; // 4MB (keep CI stable)
    const a = new Uint8Array(n);
    const b = new Uint8Array(n);
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      a[i] = i & 0xff;
      b[i] = (i * 31) & 0xff;
    }
    return {
      name: 'traditional-js',
      fn: (aa: Uint8Array, bb: Uint8Array, oo: Uint8Array, nn: number) => {
        for (let i = 0; i < nn; i++) oo[i] = aa[i] ^ bb[i];
        return oo[0];
      },
      defaultArgs: [a, b, out, n],
    };
  }

  // CRC32 example (examples/crc32.c)
  if (fnName === 'crc32_u8') {
  const n = 4 * 1024 * 1024; // 4MB (keep CI stable)
    const data = new Uint8Array(n);
    for (let i = 0; i < n; i++) data[i] = (i * 131) & 0xff;

    // Tiny JS crc32 (bitwise) baseline to match the C implementation.
    const crc32Update = (crc: number, byte: number) => {
      crc ^= byte;
      for (let k = 0; k < 8; k++) {
        const mask = -(crc & 1);
        crc = (crc >>> 1) ^ (0xedb88320 & mask);
      }
      return crc >>> 0;
    };

    return {
      name: 'traditional-js',
      fn: (buf: Uint8Array, nn: number) => {
        let crc = 0xffffffff;
        for (let i = 0; i < nn; i++) crc = crc32Update(crc, buf[i]);
        return (~crc) >>> 0;
      },
      defaultArgs: [data, n],
    };
  }

  // Histogram example (examples/histogram.c)
  if (fnName === 'histogram_u8') {
  // Node 25 + koffi can be unstable with very large TypedArray pointer marshalling
  // in worker/process isolation. Keep the default smaller for stability.
  const n = 512 * 1024; // 512KB
    const data = new Uint8Array(n);
    for (let i = 0; i < n; i++) data[i] = (i * 17) & 0xff;
    const out = new Uint32Array(256);
    return {
      name: 'traditional-js',
      fn: (buf: Uint8Array, nn: number, o: Uint32Array) => {
        o.fill(0);
        for (let i = 0; i < nn; i++) o[buf[i]]++;
        return o[0];
      },
      defaultArgs: [data, n, out],
    };
  }

  return null;
}

function pickArgs(
  fnName: string,
  jsArity: number,
  callerArgs: any[] | undefined,
): any[] {
  if (Array.isArray(callerArgs)) return callerArgs;
  const builtIn = getBuiltInBaseline(fnName);
  if (builtIn) return builtIn.defaultArgs;
  return jsArity === 0 ? [] : [1, 2];
}

function mapArgsForNative(
  fnName: string,
  args: any[],
  opts?: { isolation?: 'in-process' | 'worker' | 'process' },
): { args: any[]; keepAlive: any[] } {
  const keepAlive: any[] = [];
  // For built-in typed-array baselines, we often need to pass real pointers.
  // In this codebase, pointer-typed params are mapped to koffi pointer('void'),
  // which expects a numeric address (or a koffi pointer object), not a TypedArray.
  // So we allocate NativeBuffers and pass their numeric addresses.
  if (fnName === 'sum_u8') {
    const buf = args[0] as Uint8Array;
    const n = args[1] as number;
    if (buf && typeof n === 'number' && ArrayBuffer.isView(buf)) {
      const nb = alloc(buf.byteLength);
      nb.write(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
      keepAlive.push(nb);
      return { args: [nb, n], keepAlive };
    }
  }

  if (fnName === 'dot_f64') {
    const a = args[0] as Float64Array;
    const b = args[1] as Float64Array;
    const n = args[2] as number;
    if (a && b && typeof n === 'number' && ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
      const na = alloc(a.byteLength);
      na.write(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
      const nb = alloc(b.byteLength);
      nb.write(new Uint8Array(b.buffer, b.byteOffset, b.byteLength));
      keepAlive.push(na, nb);
  // dot_f64 is declared as (double*, double*, int).
  // With typed pointers enabled (pointer<double>), koffi expects a pointer
  // value, not a numeric address. Pass NativeBuffer so koffi can marshal.
  return { args: [na, nb, n], keepAlive };
    }
  }

  if (fnName === 'saxpy_f64') {
    const a = args[0] as number;
    const x = args[1] as Float64Array;
    const y = args[2] as Float64Array;
    const n = args[3] as number;
    if (
      typeof a === 'number' &&
      x &&
      y &&
      typeof n === 'number' &&
      ArrayBuffer.isView(x) &&
      ArrayBuffer.isView(y)
    ) {
      const nx = alloc(x.byteLength);
      nx.write(new Uint8Array(x.buffer, x.byteOffset, x.byteLength));
      const ny = alloc(y.byteLength);
      ny.write(new Uint8Array(y.buffer, y.byteOffset, y.byteLength));
      keepAlive.push(nx, ny);
      return { args: [a, nx.address, ny.address, n], keepAlive };
    }
  }

  if (fnName === 'matmul_f32') {
    const A = args[0] as Float32Array;
    const B = args[1] as Float32Array;
    const C = args[2] as Float32Array;
    const M = args[3] as number;
    const K = args[4] as number;
    const N = args[5] as number;
    if (
      A && B && C &&
      typeof M === 'number' && typeof K === 'number' && typeof N === 'number' &&
      ArrayBuffer.isView(A) && ArrayBuffer.isView(B) && ArrayBuffer.isView(C)
    ) {
      const nA = alloc(A.byteLength);
      nA.write(new Uint8Array(A.buffer, A.byteOffset, A.byteLength));
      const nB = alloc(B.byteLength);
      nB.write(new Uint8Array(B.buffer, B.byteOffset, B.byteLength));
      const nC = alloc(C.byteLength);
      nC.write(new Uint8Array(C.buffer, C.byteOffset, C.byteLength));
      keepAlive.push(nA, nB, nC);
      return { args: [nA.address, nB.address, nC.address, M, K, N], keepAlive };
    }
  }

  if (fnName === 'xor_u8') {
    const a = args[0] as Uint8Array;
    const b = args[1] as Uint8Array;
    const out = args[2] as Uint8Array;
    const n = args[3] as number;
    if (
      a && b && out && typeof n === 'number' &&
      ArrayBuffer.isView(a) && ArrayBuffer.isView(b) && ArrayBuffer.isView(out)
    ) {
      // Worker isolation path can safely accept TypedArrays (and is the default
      // for pointer-heavy kernels in benchmark mode).
      if (opts?.isolation === 'worker') {
        return { args: [a, b, out, n], keepAlive };
      }
      const na = alloc(a.byteLength);
      na.write(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
      const nb = alloc(b.byteLength);
      nb.write(new Uint8Array(b.buffer, b.byteOffset, b.byteLength));
      const no = alloc(out.byteLength);
      keepAlive.push(na, nb, no);
      return { args: [na.address, nb.address, no.address, n], keepAlive };
    }
  }

  if (fnName === 'crc32_u8') {
    const buf = args[0] as Uint8Array;
    const n = args[1] as number;
    if (buf && typeof n === 'number' && ArrayBuffer.isView(buf)) {
      if (opts?.isolation === 'worker') {
        return { args: [buf, n], keepAlive };
      }
      const nb = alloc(buf.byteLength);
      nb.write(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
      keepAlive.push(nb);
      return { args: [nb.address, n], keepAlive };
    }
  }

  if (fnName === 'histogram_u8') {
    const buf = args[0] as Uint8Array;
    const n = args[1] as number;
    const out = args[2] as Uint32Array;
    if (buf && out && typeof n === 'number' && ArrayBuffer.isView(buf) && ArrayBuffer.isView(out)) {
      if (opts?.isolation === 'worker') {
  // With typed pointers enabled (`uint32_t*` -> `pointer<uint32_t>`), koffi can
  // marshal a Uint32Array directly. Passing numeric addresses here can crash
  // (especially in very new Node majors).
  return { args: [buf, n, out], keepAlive };
      }
      const nb = alloc(buf.byteLength);
      nb.write(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
      const no = alloc(out.byteLength);
      // output doesn't need initialization
      keepAlive.push(nb, no);
      return { args: [nb.address, n, no.address], keepAlive };
    }
  }

  return { args, keepAlive };
}

export async function benchmarkNativeFunction(
  nativePath: string,
  fnName: string,
  opts?: BenchmarkOptions,
): Promise<BenchmarkResult> {
  const iterations = opts?.iterations ?? 100_000;
  const warmup = opts?.warmup ?? Math.min(10_000, Math.max(100, Math.floor(iterations * 0.05)));
  const mode = opts?.mode ?? 'sync';

  assertSafeRun(iterations);

  // NOTE: Some Node/koffi combinations (notably very new Node majors) can crash
  // when calling pointer-heavy native functions in-process in a tight benchmark loop.
  // For known pointer-heavy demo kernels, default to worker isolation even for "sync"
  // bench mode. This avoids segfaults while still providing meaningful comparisons.
  const pointerHeavy = new Set([
    'sum_u8',
    'dot_f64',
    'saxpy_f64',
    'matmul_f32',
    'xor_u8',
    'crc32_u8',
    'histogram_u8',
  ]);


  const isolation =
    mode === 'worker'
      ? ('worker' as const)
      : pointerHeavy.has(fnName)
        ? ('worker' as const)
        : ('in-process' as const);

  trace('benchmark loadNative: begin', { nativePath, fnName, isolation });
  const mod: any = await loadNative(nativePath, { isolation });
  trace('benchmark loadNative: done', { nativePath, fnName });

  const fn = mod?.[fnName];
  if (typeof fn !== 'function') {
    throw new Error(`Function not found: ${fnName}`);
  }

  // In worker isolation the wrapper may return a Promise even for "sync" mode.
  // The benchmark loop must treat it as async, otherwise we can enqueue calls
  // without backpressure and crash the worker/native layer.
  const isMaybeAsync = isolation === 'worker';

  // IMPORTANT:
  // Wrapped FFI functions may not report a meaningful JS arity (fn.length can be 0)
  // even when the native function expects arguments.
  // So we only use fn.length for truly-0-arg calls when the caller didn't supply args
  // and we don't recognize a better default.
  const { args, keepAlive } = mapArgsForNative(
    fnName,
    pickArgs(fnName, fn.length, opts?.args),
    { isolation },
  );

  trace('benchmark args ready', {
    fnName,
    argc: args.length,
    argTypes: args.map((a) =>
      a == null
        ? 'null'
        : ArrayBuffer.isView(a)
          ? (a as any).constructor?.name
          : typeof a,
    ),
    keepAlive: keepAlive.length,
  });

  // Warmup
  trace('benchmark warmup: begin', { fnName, warmup });
  for (let i = 0; i < warmup; i++) {
    const out = fn(...args);
    if (isMaybeAsync || out instanceof Promise) await out;
  }
  trace('benchmark warmup: done', { fnName });

  const latencies: number[] = [];
  const startAll = nowNs();

  trace('benchmark loop: begin', { fnName, iterations });
  for (let i = 0; i < iterations; i++) {
    const t0 = nowNs();
    const out = fn(...args);
    if (isMaybeAsync || out instanceof Promise) await out;
    const t1 = nowNs();
    latencies.push(nsToMs(t1 - t0));

    // Breadcrumbs for "silent" native crashes; keep extremely sparse.
    if (isTraceEnabled() && (i === 0 || i === 10_000 || i === 100_000 || i === iterations - 1)) {
      trace('benchmark progress', { fnName, i: i + 1 });
    }
  }
  trace('benchmark loop: done', { fnName });

  // Ensure any NativeBuffers backing pointer args stay alive until after the loop.
  // (Otherwise, passing only numeric addresses can allow GC/finalizers to free
  //  the underlying koffi allocation, causing sporadic segfaults.)
  void keepAlive;

  const endAll = nowNs();
  const totalMs = nsToMs(endAll - startAll);

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const l of latencies) {
    if (l < min) min = l;
    if (l > max) max = l;
    sum += l;
  }

  const avg = sum / latencies.length;
  const callsPerSec = iterations / (totalMs / 1000);

  return {
    fnName,
    mode,
    iterations,
    warmup,
    callsPerSec,
    avgLatencyMs: avg,
    minLatencyMs: min,
    maxLatencyMs: max,
  };
}

export async function benchmarkCompareSyncVsWorker(
  nativePath: string,
  fnName: string,
  opts?: Omit<BenchmarkOptions, 'mode'>,
): Promise<{ sync: BenchmarkResult; worker: BenchmarkResult }> {
  const sync = await benchmarkNativeFunction(nativePath, fnName, {
    ...opts,
    mode: 'sync',
  });
  const worker = await benchmarkNativeFunction(nativePath, fnName, {
    ...opts,
    mode: 'worker',
  });
  return { sync, worker };
}

export async function benchmarkCompareTraditionalVsRelaxnative(
  nativePath: string,
  fnName: string,
  opts?: Omit<BenchmarkOptions, 'mode'> & {
    /**
     * JS baseline implementation to compare against.
     * If omitted, we provide a tiny baseline only for a couple of known demo functions.
     */
    baseline?: (...args: any[]) => any;
    baselineName?: string;
  },
): Promise<{
  traditional: TraditionalBenchmarkResult;
  relaxnative: { sync: BenchmarkResult; worker: BenchmarkResult };
}> {
  const builtIn = getBuiltInBaseline(fnName);
  const baseline =
    opts?.baseline ??
    builtIn?.fn ??
    (() => {
      throw new Error(
        `No default baseline for fn=${fnName}. Provide opts.baseline to benchmark “traditional programming” for this function.`,
      );
    })();

  const baselineName = opts?.baselineName ?? builtIn?.name ?? 'traditional-js';

  const traditional = await benchmarkJsFunction(baselineName, baseline, {
    iterations: opts?.iterations,
    warmup: opts?.warmup,
  args: pickArgs(fnName, baseline.length, opts?.args),
  });

  const relaxnative = await benchmarkCompareSyncVsWorker(nativePath, fnName, opts);

  return { traditional, relaxnative };
}

export function formatBenchmarkResult(r: BenchmarkResult) {
  const f = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : String(n));
  return [
    `${r.fnName} (${r.mode})`,
    `  iterations: ${r.iterations} (warmup ${r.warmup})`,
    `  calls/sec:   ${f(r.callsPerSec)}`,
    `  avg ms:      ${f(r.avgLatencyMs)}`,
    `  min ms:      ${f(r.minLatencyMs)}`,
    `  max ms:      ${f(r.maxLatencyMs)}`,
  ].join('\n');
}

export function formatBenchmarkCompare(res: { sync: BenchmarkResult; worker: BenchmarkResult }) {
  return [formatBenchmarkResult(res.sync), '', formatBenchmarkResult(res.worker)].join('\n');
}

export function formatBenchmarkTraditionalCompare(res: {
  traditional: TraditionalBenchmarkResult;
  relaxnative: { sync: BenchmarkResult; worker: BenchmarkResult };
}) {
  const f = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : String(n));
  const t = res.traditional;

  const speedup = (relax: number) => {
    if (!Number.isFinite(relax) || !Number.isFinite(t.callsPerSec) || t.callsPerSec <= 0) return 'n/a';
    const s = relax / t.callsPerSec;
    return s.toFixed(2) + 'x';
  };

  const traditionalBlock = [
    `${t.name} (baseline)`,
    `  iterations: ${t.iterations} (warmup ${t.warmup})`,
    `  calls/sec:   ${f(t.callsPerSec)}`,
    `  avg ms:      ${f(t.avgLatencyMs)}`,
    `  min ms:      ${f(t.minLatencyMs)}`,
    `  max ms:      ${f(t.maxLatencyMs)}`,
  ].join('\n');

  const summary = [
    'Speedup vs baseline (higher is better)',
    `  sync:   ${speedup(res.relaxnative.sync.callsPerSec)}`,
    `  worker: ${speedup(res.relaxnative.worker.callsPerSec)}`,
  ].join('\n');

  return [
    traditionalBlock,
    '',
  summary,
  '',
    formatBenchmarkResult(res.relaxnative.sync),
    '',
    formatBenchmarkResult(res.relaxnative.worker),
  ].join('\n');
}
