import { readFileSync } from 'fs';

import { createParser } from './loadParser.js';
import { parseCFunctions } from './parseC.js';
import { parseRustFunctions } from './parseRust.js';
import { validateFunctions } from './validateFunctions.js';
import { generateBindings } from './generateBindings.js';
import type { NativeFunction } from './parserTypes.js';

function parseAnnotationsForFunctions(
  source: string,
  funcs: NativeFunction[],
): NativeFunction[] {
  const lines = source.split(/\r?\n/);

  // Strategy:
  // - look up to 3 lines above the function's starting line
  // - parse: @sync, @async, @cost low|medium|high
  // Works for C/C++ `//` and `/* */` (single-line usage) and Rust `//`.
  for (const fn of funcs) {
    if (!fn.sourceLine) continue;

    const idx = Math.max(0, fn.sourceLine - 1);
    const start = Math.max(0, idx - 3);
    const window = lines.slice(start, idx).join('\n');

    const mode =
      /@async\b/.test(window)
        ? 'async'
        : /@sync\b/.test(window)
          ? 'sync'
          : undefined;

    const costMatch = window.match(/@cost\s+(low|medium|high)\b/);
    const cost = (costMatch?.[1] as 'low' | 'medium' | 'high' | undefined) ??
      undefined;

    if (mode || cost) {
      fn.annotations = { ...(fn.annotations ?? {}), mode, cost };
    }
  }
  return funcs;
}

export function parseNativeSource(
  filePath: string,
  lang: 'c' | 'cpp' | 'rust',
) {
  const source = readFileSync(filePath, 'utf8');
  const parser = createParser(lang);
  const tree = parser.parse(source);

  const rawFunctions =
    lang === 'rust'
      ? parseRustFunctions(tree)
      : parseCFunctions(tree);

  const annotated = parseAnnotationsForFunctions(source, rawFunctions);
  const validFunctions = validateFunctions(annotated);
  return generateBindings(validFunctions);
}
