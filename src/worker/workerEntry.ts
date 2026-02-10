import { parentPort } from 'worker_threads';
import { loadFfi } from '../ffi/index.js';

let cache: {
  libPath: string;
  api: any;
} | null = null;

parentPort!.on('message', (msg) => {
  const { id, libPath, bindings, fn, args } = msg;

  try {
    if (!cache || cache.libPath !== libPath) {
      cache = {
        libPath,
  api: loadFfi(libPath, bindings),
      };
    }

    const result = cache.api[fn](...args);
    parentPort!.postMessage({ id, result });
  } catch (err: any) {
    parentPort!.postMessage({
      id,
      error: err.message ?? String(err),
      errorCallsite: (msg as any).callsite,
    });
  }
});
