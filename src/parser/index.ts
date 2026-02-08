import { readFileSync } from 'fs';

import { createParser } from './loadParser.js';
import { parseCFunctions } from './parseC.js';
import { parseRustFunctions } from './parseRust.js';
import { validateFunctions } from './validateFunctions.js';
import { generateBindings } from './generateBindings.js';

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

  const validFunctions = validateFunctions(rawFunctions);
  return generateBindings(validFunctions);
}
