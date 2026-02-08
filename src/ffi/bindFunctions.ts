import type { FfiBindings } from './ffiTypes.js';
import { mapType } from './typeMap.js';

export function bindFunctions(
  lib: any,
  bindings: FfiBindings,
): Record<string, Function> {
  const exports: Record<string, Function> = {};

  for (const fn of bindings.functions) {
    exports[fn.name] = lib.func(
      fn.name,
      mapType(fn.returns),
      fn.args.map(mapType),
    );
  }

  return exports;
}
