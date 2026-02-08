import type { FfiBindings } from './ffiTypes.js';

import { bindFunctions } from './bindFunctions.js';
import { loadLibrary } from './createLibrary.js';

export function loadFfi(
  libPath: string,
  bindings: FfiBindings,
) {
  const lib = loadLibrary(libPath);
  return bindFunctions(lib, bindings);
}
