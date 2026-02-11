import { callAsync } from './workerClient.js';
import { captureCallsite } from '../utils/callsite.js';
import { callIsolated } from './processClient.js';
import { traceDebug } from '../dx/trace.js';
import { formatBindingSignature } from '../dx/trace.js';

export function wrapFunctions(
  api: Record<string, Function>,
  libPath: string,
  bindings: any,
  opts?: { isolation?: 'in-process' | 'worker' | 'process' },
) {
  const wrapped: Record<string, Function> = {};
  const isolation = opts?.isolation ?? 'worker';

  // Safety metadata may be attached by registry loads.
  const safety = bindings?.__safety ?? { trust: 'local' };

  const bindingNames = Object.keys(bindings?.functions ?? {});
  const apiNames = Object.keys(api ?? {});
  const names = Array.from(new Set([...bindingNames, ...apiNames]));

  for (const name of names) {
    const fn = (api as any)?.[name] as Function | undefined;
    const binding = bindings?.functions?.[name];
    const isAsync =
      binding?.mode === 'async' ||
      binding?.async === true ||
      binding?.thread === 'worker' ||
      binding?.cost === 'high';

    wrapped[name] = (...args: any[]) => {
      traceDebug('dispatch', {
        isolation,
        fn: name,
        argc: args?.length ?? 0,
        mode: binding?.mode,
        cost: binding?.cost,
      });
      // base dispatch by requested isolation
      if (isolation === 'process') {
  // In process isolation we must go through IPC to be crash-safe.
  // This is inherently async.
  return callIsolated(libPath, bindings, name, args, safety);
      }

      if (isolation === 'worker') {
        // Worker isolation can always proxy through the worker pool.
        // If the direct function binding exists (common for sync), call it
        // for lower overhead; otherwise fall back to the worker client.
        if (typeof fn === 'function' && !isAsync) {
          return fn(...args);
        }
        return callAsync(libPath, bindings, name, args);
      }

      // in-process: fastest, unsafe
      if (typeof fn !== 'function') {
        const available = Object.keys(api ?? {});
        const sig = binding ? formatBindingSignature(binding) : undefined;
        const detail = [
          `Function not found: ${name}`,
          sig ? `Signature (from parser): ${sig}` : undefined,
          available.length ? `Available exports: ${available.join(', ')}` : undefined,
        ].filter(Boolean);
        throw new Error(detail.join('\n'));
      }
      return fn(...args);
    };
  }

  // Allow helper-side synthetic hooks (used by tests, and potentially future runtime APIs)
  // by proxying unknown calls through IPC when isolation is process.
  if (isolation === 'process') {
    (wrapped as any).__call = (fn: string, ...args: any[]) =>
      callIsolated(libPath, bindings, fn, args, safety, captureCallsite());

    return new Proxy(wrapped, {
      get(target, prop) {
        if (typeof prop !== 'string') return (target as any)[prop];
  // Avoid thenable detection in test frameworks/Promise utilities.
  if (prop === 'then') return undefined;
        if (prop in target) return (target as any)[prop];

  return (...args: any[]) => callIsolated(libPath, bindings, prop, args, safety, captureCallsite());
      },
    });
  }

  // In worker isolation, also proxy unknown calls through the worker client.
  // This supports synthetic bindings (like the native test harness) even if the
  // in-process API didn't enumerate the function.
  if (isolation === 'worker') {
    return new Proxy(wrapped, {
      get(target, prop) {
        if (typeof prop !== 'string') return (target as any)[prop];
        // Avoid thenable detection in test frameworks/Promise utilities.
        if (prop === 'then') return undefined;
        if (prop in target) return (target as any)[prop];
        return (...args: any[]) => callAsync(libPath, bindings, prop, args);
      },
    });
  }

  return wrapped;
}
