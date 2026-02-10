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
      const result = await fn(...msg.args);
      reply({ id: msg.id, ok: true, result });
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
