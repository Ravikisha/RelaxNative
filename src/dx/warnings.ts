import { logWarn } from './logger.js';

export type RelaxnativeWarningCode =
  | 'UNSAFE_NATIVE_PATTERN'
  | 'FALLBACK_BEHAVIOR'
  | 'ABI_CHANGE_REQUIRES_RESTART';

export type RelaxnativeWarning = {
  code: RelaxnativeWarningCode;
  message: string;
  hint?: string;
};

/**
 * Emit a non-fatal warning.
 *
 * This must never throw and must not print unless debug logging is enabled.
 */
export function warn(w: RelaxnativeWarning) {
  try {
    const hint = w.hint ? ` Hint: ${w.hint}` : '';
    logWarn(`warning(${w.code}): ${w.message}${hint}`);
  } catch {
    // Never throw from warnings.
  }
}
