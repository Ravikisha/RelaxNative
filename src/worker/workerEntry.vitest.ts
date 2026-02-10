// Vitest/dev-only worker entry.
// This file avoids `.js` specifiers so the TS runtime loader can resolve modules.
import { parentPort } from 'worker_threads';
async function loadFfi(libPath: string, bindings: any) {
  // Import the TS sources directly; avoids missing `.js` build artifacts in Vitest.
  const { bindFunctions } = await import('../ffi/bindFunctions.ts');
  const { loadLibrary } = await import('../ffi/createLibrary.ts');
  const lib = loadLibrary(libPath);
  return bindFunctions(lib, bindings);
}

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
        api: null,
      };
    }

    Promise.resolve(cache.api ?? loadFfi(libPath, bindings))
      .then((api) => {
        cache!.api = api;
        const result = api[fn](...args);
        parentPort!.postMessage({ id, result });
      })
      .catch((err: any) => {
        parentPort!.postMessage({
          id,
          error: err.message ?? String(err),
        });
      });
  } catch (err: any) {
    parentPort!.postMessage({
      id,
      error: err.message ?? String(err),
    });
  }
});
