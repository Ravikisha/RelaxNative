import { Worker } from 'worker_threads';
import { existsSync } from 'fs';
import { fileURLToPath } from 'node:url';

import type { WorkerRequest, WorkerResponse } from './workerTypes.js';

const WORKER_ENTRY_TS_URL = new URL(
  './workerEntry.vitest.ts',
  import.meta.url,
);
const WORKER_ENTRY_JS_URL = new URL('./workerEntry.js', import.meta.url);

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (res: WorkerResponse) => void>();

function getWorker(): Worker {
  if (!worker) {
    // Prefer the built JS entry when present (normal runtime).
    // Fall back to TS import bootstrap for Vitest/dev environments.
  if (existsSync(fileURLToPath(WORKER_ENTRY_JS_URL))) {
      worker = new Worker(WORKER_ENTRY_JS_URL, {
        env: { ...process.env },
      });
    } else {
      const entryHref = WORKER_ENTRY_TS_URL.href;
      const bootstrap = `import(${JSON.stringify(entryHref)});`;

      worker = new Worker(bootstrap, {
        eval: true,
        env: { ...process.env },
      });
    }

    worker.on('message', (msg: WorkerResponse) => {
      const resolve = pending.get(msg.id);
      if (resolve) {
        resolve(msg);
        pending.delete(msg.id);
      }
    });
  }
  return worker;
}

export function runInWorker(
  req: Omit<WorkerRequest, 'id'>,
): Promise<any> {
  const id = ++seq;
  const w = getWorker();

  return new Promise((resolve, reject) => {
    pending.set(id, (res) => {
      if (res.error) {
        const err = new Error(res.error + (res.errorCallsite ? `\n--- remote callsite ---\n${res.errorCallsite}` : ''));
        reject(err);
      } else resolve(res.result);
    });

    w.postMessage({ ...req, id });
  });
}
