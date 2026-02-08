import type { NativeFunction } from './parserTypes.js';

export function validateFunctions(funcs: NativeFunction[]): NativeFunction[] {
  return funcs.filter((fn) => {
    if (fn.returnType === 'unknown') return false;
    if (fn.params.some((p) => p.type === 'unknown')) return false;
    return true;
  });
}
