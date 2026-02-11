import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { traceDebug, traceError, traceInfo } from '../dx/trace.js';

export type ProcessIsolationErrorCode =
  | 'ISOLATED_PROCESS_CRASH'
  | 'ISOLATED_PROCESS_EXIT'
  | 'ISOLATED_PROCESS_START_FAILED'
  | 'ISOLATED_PROCESS_PROTOCOL_ERROR';

export class ProcessIsolationError extends Error {
  readonly code: ProcessIsolationErrorCode;
  readonly details?: any;

  constructor(code: ProcessIsolationErrorCode, message: string, details?: any) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

type IsolatedCallRequest = {
  id: number;
  type: 'call';
  libPath: string;
  bindings: any;
  safety?: {
    trust?: 'local' | 'community' | 'verified';
    permissions?: any;
    limits?: { timeoutMs?: number; memoryBytes?: number };
  };
  fn: string;
  args: any[];
};

type IsolatedPingRequest = {
  id: number;
  type: 'ping';
};

type IsolatedRequest = IsolatedCallRequest | IsolatedPingRequest;

type IsolatedResponse =
  | { id: number; ok: true; result: any; args?: any[] }
  | {
      id: number;
      ok: false;
      error: { name: string; message: string; stack?: string; callsite?: string };
    };

let child: ChildProcess | null = null;
let seq = 0;
const pending = new Map<
  number,
  { resolve: (v: any) => void; reject: (e: any) => void; cp: ChildProcess }
>();

function helperEntryPath() {
  // Resolve the helper entry from the *installed package root*.
  // This file is bundled into dist/chunk-*.js, so relative URLs can be surprising
  // once installed under node_modules.
  const here = dirname(fileURLToPath(import.meta.url));

  // Walk up until we find the package boundary (package.json).
  // This is more robust than assuming a fixed depth like "../..".
  let cur = here;
  for (let i = 0; i < 8; i++) {
    const candidate = join(cur, 'package.json');
    if (existsSync(candidate)) {
      const pkgRoot = cur;
      const distEntry = join(pkgRoot, 'dist', 'worker', 'processEntry.js');
      return { distEntry, pkgRoot };
    }
    const parent = join(cur, '..');
    if (parent === cur) break;
    cur = parent;
  }

  // Fallback to previous behavior.
  const pkgRoot = join(here, '..', '..');
  const distEntry = join(pkgRoot, 'dist', 'worker', 'processEntry.js');
  return { distEntry, pkgRoot };
}

function startChild(): ChildProcess {
  if (child && child.connected) return child;

  const { distEntry } = helperEntryPath();

  if (!existsSync(distEntry)) {
    traceError('isolation.process.helper.missing', { distEntry });
    throw new ProcessIsolationError(
      'ISOLATED_PROCESS_START_FAILED',
      `Process isolation helper was not found at: ${distEntry}. This usually means the package was published without dist/worker/processEntry.js`,
      { distEntry },
    );
  }

  // fork() needs a JS file. In dev/vitest, dist likely exists because tests build.
  const entry = distEntry;

  traceInfo('isolation.process.helper.start', { entry });

  const cp = fork(entry, {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    env: {
      ...process.env,
      RELAXNATIVE_PROCESS_ISOLATION: '1',
    },
  });

  cp.on('message', (msg: any) => {
    if (!msg || typeof msg.id !== 'number') return;
    const p = pending.get(msg.id);
    if (!p) return;
  // Ignore stray messages from a previous helper.
  if (p.cp !== cp) return;
    pending.delete(msg.id);

  const res = msg as IsolatedResponse;
  if (res.ok) p.resolve(res);
    else {
  const details: string[] = [res.error.message];
  if (res.error.callsite) details.push('\n--- remote callsite ---\n' + res.error.callsite);
  const err = new Error(details.join('\n'));
  err.name = res.error.name;
  (err as any).stack = res.error.stack;
  p.reject(err);
    }
  });

  const rejectAll = (reason: ProcessIsolationError) => {
    for (const [id, p] of pending) {
  if (p.cp !== cp) continue;
  pending.delete(id);
  p.reject(reason);
    }
  };

  cp.on('exit', (code, signal) => {
  // Clear cached child early so any concurrent or subsequent calls will
  // create a fresh helper process.
  if (child === cp) child = null;
    const reason = new ProcessIsolationError(
      signal ? 'ISOLATED_PROCESS_CRASH' : 'ISOLATED_PROCESS_EXIT',
      `Isolated runtime exited (code=${code}, signal=${signal ?? 'none'})`,
      { code, signal },
    );
  traceError('isolation.process.helper.exit', { code, signal });
    rejectAll(reason);
  });

  cp.on('error', (err) => {
    const reason = new ProcessIsolationError(
      'ISOLATED_PROCESS_START_FAILED',
      `Failed to start isolated runtime: ${String(err)}`,
      { err },
    );
  traceError('isolation.process.helper.error', { message: String(err) });
    child = null;
    rejectAll(reason);
  });

  child = cp;
  return cp;
}

async function ping(cp: ChildProcess) {
  const id = ++seq;
  const req: IsolatedPingRequest = { id, type: 'ping' };
  traceDebug('isolation.process.ping', { id });
  return new Promise<void>((resolve, reject) => {
  pending.set(id, { resolve, reject, cp });
    cp.send(req);
  });
}

export async function callIsolated(
  libPath: string,
  bindings: any,
  fn: string,
  args: any[],
  safety?: { trust?: 'local' | 'community' | 'verified'; permissions?: any; limits?: any },
  callsite?: string,
) {
  // Keep references to original args so we can update in-place outputs after IPC.
  const originalArgs = Array.isArray(args) ? args : [];
  const cp = startChild();

  // If this is a fresh process, ensure it responds before sending heavy work.
  // (Prevents a race where send() succeeds but entry isn't ready.)
  await ping(cp);

  const id = ++seq;
  traceDebug('isolation.process.call', {
    id,
    fn,
    argc: args?.length ?? 0,
    hasSafety: !!safety,
    hasCallsite: !!callsite,
  });
  const req: IsolatedCallRequest = {
    id,
    type: 'call',
    libPath,
    bindings,
  safety,
    fn,
    // Structured-clone can't send TypedArrays as "real" typed arrays through fork IPC
    // in a way that koffi consistently recognizes in the helper.
    // We serialize them explicitly and reconstruct in processEntry.
    args: Array.isArray(args)
      ? args.map((a) => {
          if (a && ArrayBuffer.isView(a)) {
            const view = a as ArrayBufferView;
            return {
              __relaxnative_typedarray: true,
              type: (a as any).constructor?.name ?? 'TypedArray',
              // clone exact bytes used by the view
              bytes: Buffer.from(
                view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
              ),
            };
          }
          return a;
        })
      : args,
  // forward the captured JS callsite for richer crash diagnostics
  ...(callsite ? { callsite } : {}),
  };

  const timeoutMs = safety?.limits?.timeoutMs;

  const baseCall = new Promise((resolve, reject) => {
    let t: NodeJS.Timeout | null = null;
    let timedOut = false;

    const wrappedResolve = (v: any) => {
      if (timedOut) return;
      if (t) clearTimeout(t);
      resolve(v);
    };
    const wrappedReject = (e: any) => {
      if (timedOut) return;
      if (t) clearTimeout(t);
      reject(e);
    };

    if (typeof timeoutMs === 'number' && timeoutMs > 0) {
      t = setTimeout(() => {
  timedOut = true;
  // Ensure late replies can't resolve the promise.
  pending.delete(id);
        // Kill helper to stop the native code; it will be restarted on next call.
        try {
          cp.kill();
        } catch {
          // ignore
        }
        wrappedReject(
          new ProcessIsolationError(
            'ISOLATED_PROCESS_CRASH',
            `Isolated runtime exceeded timeout (${timeoutMs}ms)`,
            { timeoutMs },
          ),
        );
      }, timeoutMs);
    }

  pending.set(id, { resolve: wrappedResolve, reject: wrappedReject, cp });
  cp.send(req);
  });

  const withResult = async () => {
  const res = (await baseCall) as any;

    // Copy back any TypedArray outputs.
    // Heuristic: if the user passed a TypedArray, treat it as an in/out buffer.
    // (For const input-only buffers the copy is redundant but safe.)
  const returnedBoxedArgs = Array.isArray(res?.args) ? res.args : null;
    if (returnedBoxedArgs) {
      for (let i = 0; i < returnedBoxedArgs.length; i++) {
        const orig = originalArgs[i];
        const boxed = returnedBoxedArgs[i];
        if (orig && ArrayBuffer.isView(orig) && boxed?.__relaxnative_typedarray === true) {
          const bytesObj = boxed.bytes;
          const buf: Buffer = Buffer.isBuffer(bytesObj)
            ? bytesObj
            : bytesObj?.type === 'Buffer' && Array.isArray(bytesObj?.data)
              ? Buffer.from(bytesObj.data)
              : Buffer.from([]);
          const u8 = new Uint8Array(orig.buffer, (orig as any).byteOffset ?? 0, (orig as any).byteLength ?? 0);
          u8.set(new Uint8Array(buf.buffer, buf.byteOffset, Math.min(buf.byteLength, u8.byteLength)));
        }
      }
    }

  return res?.result;
  };

  if (typeof timeoutMs === 'number' && timeoutMs > 0) {
    return Promise.race([
      withResult(),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new ProcessIsolationError(
              'ISOLATED_PROCESS_CRASH',
              `Isolated runtime exceeded timeout (${timeoutMs}ms)`,
              { timeoutMs },
            ),
          );
        }, timeoutMs + 25);
      }),
    ]);
  }

  return withResult();
}

export function stopIsolatedRuntime() {
  if (!child) return;
  try {
    child.kill();
  } catch {
    // ignore
  }
  child = null;
}
