import { runInWorker } from './workerPool.js';
import { logDebug } from '../dx/logger.js';
import { captureCallsite } from '../utils/callsite.js';
import { traceDebug } from '../dx/trace.js';

export function callAsync(
  libPath: string,
  bindings: any,
  fn: string,
  args: any[],
) {
  const callsite = captureCallsite();
  logDebug('worker dispatch', { fn, callsite: !!callsite });

  traceDebug('isolation.worker.dispatch', {
    fn,
    libPath,
    argc: args?.length ?? 0,
    argTypes: Array.isArray(args) ? args.map((a) => {
      if (a == null) return String(a);
      if (ArrayBuffer.isView(a)) return (a as any).constructor?.name ?? 'TypedArray';
      return typeof a;
    }) : [],
    hasCallsite: !!callsite,
  });

  return runInWorker({ libPath, bindings, fn, args, callsite });
}
