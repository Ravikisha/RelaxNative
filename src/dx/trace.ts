import { performance } from 'node:perf_hooks';

export type TraceLevel = 'error' | 'warn' | 'info' | 'debug';

function envTraceEnabled(): boolean {
  const v = process.env.RELAXNATIVE_TRACE;
  return v === '1' || v === 'true' || v === 'yes';
}

function envTraceLevel(): TraceLevel {
  const v = (process.env.RELAXNATIVE_TRACE_LEVEL ?? '').toLowerCase();
  if (v === 'error' || v === 'warn' || v === 'info' || v === 'debug') return v;
  // Default to info so tracing is helpful without being too noisy.
  return 'info';
}

const order: Record<TraceLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export function isTraceEnabled(): boolean {
  return envTraceEnabled();
}

export function shouldTrace(level: TraceLevel): boolean {
  if (!envTraceEnabled()) return false;
  return order[level] <= order[envTraceLevel()];
}

export function trace(level: TraceLevel, event: string, data?: any) {
  if (!shouldTrace(level)) return;

  const payload: any = {
    t: Number(performance.now().toFixed(3)),
    pid: process.pid,
    level,
    event,
  };
  if (data !== undefined) payload.data = data;

  // eslint-disable-next-line no-console
  console.log('[relaxnative:trace]', JSON.stringify(payload));
}

export function traceError(event: string, data?: any) {
  trace('error', event, data);
}

export function traceWarn(event: string, data?: any) {
  trace('warn', event, data);
}

export function traceInfo(event: string, data?: any) {
  trace('info', event, data);
}

export function traceDebug(event: string, data?: any) {
  trace('debug', event, data);
}

export function formatBindingSignature(binding: any): string {
  if (!binding) return '';
  const name = binding?.name ?? '<anonymous>';
  const returns = binding?.returns ?? 'void';
  const args = Array.isArray(binding?.args) ? binding.args : [];
  return `${returns} ${name}(${args.join(', ')})`;
}
