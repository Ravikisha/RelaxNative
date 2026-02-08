import { execFileSync } from 'child_process';

import { which } from '../utils/which.js';
import type { CompilerInfo } from './compilerTypes.js';

export function detectRustCompiler(): CompilerInfo | null {
  const rustc = process.env.RUSTC ?? which('rustc');
  if (!rustc) return null;

  const version = execFileSync(rustc, ['--version'], {
    encoding: 'utf8',
  }).trim();

  return {
    kind: 'rust',
    path: rustc,
    version,
    vendor: 'rust',
  };
}
