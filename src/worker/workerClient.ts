import { runInWorker } from './workerPool.js';
import { logDebug } from '../dx/logger.js';
import { captureCallsite } from '../utils/callsite.js';

export function callAsync(
  libPath: string,
  bindings: any,
  fn: string,
  args: any[],
) {
  const callsite = captureCallsite();
  logDebug('worker dispatch', { fn, callsite: !!callsite });
  return runInWorker({ libPath, bindings, fn, args, callsite });
}
