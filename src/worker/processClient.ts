import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
  | { id: number; ok: true; result: any }
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
  // Resolve the helper entry from the package root.
  // This file may be bundled into dist/chunk-*.js, so relative URLs are unreliable.
  const here = dirname(fileURLToPath(import.meta.url));
  // In dev/vitest, `here` is typically `<pkg>/src/worker`.
  // In dist builds, `here` is typically `<pkg>/dist` because this code is bundled
  // into `dist/chunk-*.js`.
  // We *always* want to fork the built helper at `<pkg>/dist/worker/processEntry.js`.
  const pkgRoot = join(here, '..', '..');
  const distEntry = join(pkgRoot, 'dist', 'worker', 'processEntry.js');
  return { distEntry, pkgRoot };
}

function startChild(): ChildProcess {
  if (child && child.connected) return child;

  const { distEntry } = helperEntryPath();

  // fork() needs a JS file. In dev/vitest, dist likely exists because tests build.
  const entry = distEntry;

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
    if (res.ok) p.resolve(res.result);
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
    rejectAll(reason);
  });

  cp.on('error', (err) => {
    const reason = new ProcessIsolationError(
      'ISOLATED_PROCESS_START_FAILED',
      `Failed to start isolated runtime: ${String(err)}`,
      { err },
    );
    child = null;
    rejectAll(reason);
  });

  child = cp;
  return cp;
}

async function ping(cp: ChildProcess) {
  const id = ++seq;
  const req: IsolatedPingRequest = { id, type: 'ping' };
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
  const cp = startChild();

  // If this is a fresh process, ensure it responds before sending heavy work.
  // (Prevents a race where send() succeeds but entry isn't ready.)
  await ping(cp);

  const id = ++seq;
  const req: IsolatedCallRequest = {
    id,
    type: 'call',
    libPath,
    bindings,
  safety,
    fn,
  args,
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

  if (typeof timeoutMs === 'number' && timeoutMs > 0) {
    return Promise.race([
      baseCall,
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

  return baseCall;
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
