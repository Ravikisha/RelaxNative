import { readFileSync } from 'fs';
import crypto from 'crypto';

import type { CompilerInfo } from '../compiler/compilerTypes.js';

type HashInput = {
  sourcePath: string;
  compiler: CompilerInfo;
  flags: string[];
  platform: string;
};

export function computeHash(input: HashInput): string {
  const source = readFileSync(input.sourcePath, 'utf8');

  const hash = crypto.createHash('sha256');
  hash.update(source);
  hash.update(input.compiler.path);
  hash.update(input.compiler.version);
  hash.update(input.flags.join(' '));
  hash.update(input.platform);

  return hash.digest('hex');
}
