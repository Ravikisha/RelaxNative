/* eslint-disable no-console */
import { loadFfi } from '../ffi/index.js';
import { wrapFunctions } from './wrapFunctions.js';
import { applySafetyGuards } from './safetyGuards.js';
import { createRequire } from 'node:module';


type Req =
  | { id: number; type: 'ping' }
  | {
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

type Res =
  | { id: number; ok: true; result: any }
  | {
      id: number;
      ok: false;
  error: { name: string; message: string; stack?: string; callsite?: string };
    };

function reply(msg: Res) {
  if (process.send) process.send(msg);
}

function reviveArg(a: any): any {
  if (!a || typeof a !== 'object') return a;
  if (a.__relaxnative_typedarray === true && a.bytes) {
    // IPC may deliver Buffer either as a real Buffer, or as a plain object
    // like { type: 'Buffer', data: number[] }.
    const buf: Buffer = Buffer.isBuffer(a.bytes)
      ? a.bytes
      : a.bytes?.type === 'Buffer' && Array.isArray(a.bytes?.data)
        ? Buffer.from(a.bytes.data)
        : Array.isArray(a.bytes)
          ? Buffer.from(a.bytes)
          : Buffer.from([]);

    // Create an ArrayBuffer view of the exact bytes.
  // Build a standalone ArrayBuffer so typed arrays have stable backing memory.
  const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const ab = u8.slice().buffer;
    switch (a.type) {
      case 'Uint8Array':
        return new Uint8Array(ab);
      case 'Int8Array':
        return new Int8Array(ab);
      case 'Uint16Array':
        return new Uint16Array(ab);
      case 'Int16Array':
        return new Int16Array(ab);
      case 'Uint32Array':
        return new Uint32Array(ab);
      case 'Int32Array':
        return new Int32Array(ab);
      case 'BigInt64Array':
        return new BigInt64Array(ab);
      case 'BigUint64Array':
        return new BigUint64Array(ab);
      case 'Float32Array':
        return new Float32Array(ab);
      case 'Float64Array':
        return new Float64Array(ab);
      default:
        // Unknown typed array; pass the raw bytes as Uint8Array.
        return new Uint8Array(ab);
    }
  }
  return a;
}

process.on('message', async (msg: any) => {
  try {
  if (!msg || typeof msg.id !== 'number') return;

  if (msg.type === 'ping') {
      reply({ id: msg.id, ok: true, result: true });
      return;
    }

  if (msg.type !== 'call') {
      reply({
        id: msg.id,
        ok: false,
        error: {
          name: 'ProtocolError',
          message: `Unknown request type: ${(msg as any).type}`,
        },
      });
      return;
    }

    const api = loadFfi(msg.libPath, msg.bindings);

    // Apply runtime guards in the helper before executing any native entry.
    // This is best-effort: it restricts common Node capabilities, not syscalls.
    const guards = applySafetyGuards({
      trust: msg.safety?.trust,
      permissions: msg.safety?.permissions,
      limits: msg.safety?.limits,
    });

    // In the helper process we always run calls in-process.
    const wrapped = wrapFunctions(api, msg.libPath, msg.bindings, {
      isolation: 'in-process',
    });

    // Internal test-only hooks to validate runtime guards.
    // These are only reachable in process isolation mode and only used by tests.
    (wrapped as any).__test_forbidden_fs = async () => {
  const req = createRequire(import.meta.url);
  const fs = req('node:fs');
      fs.readFileSync('/etc/hosts', 'utf8');
      return true;
    };
    (wrapped as any).__test_forbidden_net = async () => {
  const req = createRequire(import.meta.url);
  const https = req('node:https');
      await new Promise((resolve, reject) => {
        const req = (https as any).get('https://example.com', (res: any) => {
          res.resume();
          resolve(true);
        });
        req.on('error', reject);
      });
      return true;
    };
    (wrapped as any).__test_forbidden_spawn = async () => {
  const req = createRequire(import.meta.url);
  const cp = req('node:child_process');
      cp.execSync('echo hi');
      return true;
    };

    const fn = (wrapped as any)[msg.fn];
    if (typeof fn !== 'function') {
      reply({
        id: msg.id,
        ok: false,
        error: {
          name: 'MissingFunctionError',
          message: `Function not found: ${msg.fn}`,
        },
      });
      return;
    }

    try {
      // Keep both the raw boxed args (for copying back output bytes)
      // and revived args (for calling koffi/native).
      const boxedArgs = Array.isArray(msg.args) ? msg.args : [];
      const revivedArgs = Array.isArray(msg.args) ? msg.args.map(reviveArg) : msg.args;

      const result = await fn(...revivedArgs);

      // Copy mutated typed arrays back into the boxed Buffer so the parent can
      // update the original user-provided TypedArray.
      if (Array.isArray(revivedArgs) && Array.isArray(boxedArgs)) {
        for (let i = 0; i < revivedArgs.length; i++) {
          const revived = revivedArgs[i];
          const boxed = boxedArgs[i];
          if (boxed?.__relaxnative_typedarray === true && revived && ArrayBuffer.isView(revived)) {
            const view = revived as ArrayBufferView;
            boxed.bytes = Buffer.from(
              view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
            );
          }
        }
      }

      reply({ id: msg.id, ok: true, result, args: boxedArgs } as any);
    } finally {
      guards.restore();
    }
  } catch (err: any) {
    reply({
      id: (msg as any)?.id ?? -1,
      ok: false,
      error: {
        name: err?.name ?? 'Error',
        message: String(err?.message ?? err),
        stack: err?.stack,
  // include the caller-side callsite if provided
  callsite: (msg as any)?.callsite,
      },
    });
  }
});
