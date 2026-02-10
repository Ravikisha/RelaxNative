export type LogLevel = 'debug' | 'info' | 'warn';

let enabled = false;

// Keep this extremely low overhead when disabled.
export function isDebugEnabled(): boolean {
  return enabled || process.env.RELAXNATIVE_DEBUG === '1';
}

/**
 * Enable/disable Relaxnative debug logging programmatically.
 *
 * This is primarily intended for tests.
 */
export function setDebugEnabled(v: boolean) {
  enabled = v;
}

export function logDebug(...args: any[]) {
  if (!isDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.log('[relaxnative]', ...args);
}

export function logInfo(...args: any[]) {
  if (!isDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.log('[relaxnative]', ...args);
}

export function logWarn(...args: any[]) {
  if (!isDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.warn('[relaxnative]', ...args);
}
