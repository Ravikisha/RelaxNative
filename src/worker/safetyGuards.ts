import type { RelaxPermissions } from '../registry/relaxJsonTypes.js';

import { createRequire } from 'node:module';

export type SafetyGuardsOptions = {
  permissions?: RelaxPermissions;
  trust?: 'local' | 'community' | 'verified';
  limits?: {
    timeoutMs?: number;
    memoryBytes?: number;
  };
};

export type AppliedGuards = {
  restore(): void;
};

function deny(message: string): never {
  const err = new Error(message);
  err.name = 'PermissionDeniedError';
  throw err;
}

export function applySafetyGuards(opts: SafetyGuardsOptions): AppliedGuards {
  const perms = opts.permissions;

  // Save originals for restore.
  const originals: Array<() => void> = [];

  // --- module-load guard (best-effort runtime enforcement) ---
  // We can't reliably monkey-patch ESM namespace exports (read-only).
  // Instead, we deny importing certain Node built-ins in the isolated helper.
  const req = createRequire(import.meta.url) as any;
  const origRequire = req;
  const origLoad = (req as any).resolve ? null : null;

  const blocked = new Set<string>();
  if (!perms?.process?.spawn) blocked.add('node:child_process'), blocked.add('child_process');
  if (!(perms?.fs?.read?.length || perms?.fs?.write?.length)) blocked.add('node:fs'), blocked.add('fs');
  if (!perms?.network?.outbound) {
    blocked.add('node:net');
    blocked.add('net');
    blocked.add('node:http');
    blocked.add('http');
    blocked.add('node:https');
    blocked.add('https');
  }

  // Patch global require if present (CJS) and also patch Module._load for safety.
  // In the helper we use tsup ESM, but internal code can still access createRequire.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Module = req('node:module');
  const origModuleLoad = Module._load;
  const origResolveFilename = Module._resolveFilename;
  Module._load = function (request: string, parent: any, isMain: boolean) {
    if (blocked.has(request)) {
      return deny(`Import denied: ${request}`);
    }
    return origModuleLoad.apply(this, arguments as any);
  };
  Module._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
    if (blocked.has(request)) {
      return deny(`Import denied: ${request}`);
    }
    return origResolveFilename.apply(this, arguments as any);
  };
  originals.push(() => {
    Module._load = origModuleLoad;
    Module._resolveFilename = origResolveFilename;
  });

  // --- best-effort memory cap ---
  let memTimer: NodeJS.Timeout | null = null;
  const memoryBytes = opts.limits?.memoryBytes;
  if (typeof memoryBytes === 'number' && memoryBytes > 0) {
    memTimer = setInterval(() => {
      const rss = process.memoryUsage().rss;
      if (rss > memoryBytes) {
        // Exiting the helper process is the simplest enforcement mechanism.
        // Parent will restart and reject pending calls.
        // eslint-disable-next-line no-process-exit
        process.exit(137);
      }
    }, 50);
    memTimer.unref();
    originals.push(() => {
      if (memTimer) clearInterval(memTimer);
    });
  }

  return {
    restore() {
      for (const r of originals.reverse()) r();
    },
  };
}
