import type { NativeFunction } from './parserTypes.js';

export function generateBindings(functions: NativeFunction[]) {
  return {
    functions: functions.map((f) => ({
      name: f.name,
      returns: f.returnType,
      args: f.params.map((p) => p.type),
    })),
  };
}
