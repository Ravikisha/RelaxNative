import type { NativeFunction } from './parserTypes.js';

export function generateBindings(functions: NativeFunction[]) {
  const entries = functions.map((f) => [
    f.name,
    {
      name: f.name,
      returns: f.returnType,
      args: f.params.map((p) => p.type),
      // optional execution hints
      mode: f.annotations?.mode,
      cost: f.annotations?.cost,
    },
  ] as const);

  return {
    functions: Object.fromEntries(entries),
  };
}
