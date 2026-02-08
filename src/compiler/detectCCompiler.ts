import { execFileSync } from 'child_process';

import { which } from '../utils/which.js';
import type { CompilerInfo } from './compilerTypes.js';

function getVersion(path: string): string {
  try {
    return execFileSync(path, ['--version'], { encoding: 'utf8' })
      .split('\n')[0]
      .trim();
  } catch {
    return 'unknown';
  }
}

export function detectCCompiler(): CompilerInfo {
  const candidates = [
    process.env.CC,
    'clang',
    'gcc',
    'cc',
    'cl',
  ].filter(Boolean) as string[];

  for (const name of candidates) {
    const resolved = name.includes('/') ? name : which(name);
    if (!resolved) continue;

    const version = getVersion(resolved);
    return {
      kind: 'c',
      path: resolved,
      version,
      vendor: resolved.includes('clang')
        ? 'clang'
        : resolved.includes('gcc')
        ? 'gcc'
        : resolved.includes('cl')
        ? 'msvc'
        : 'unknown',
    };
  }

  throw new Error('No C compiler found (gcc/clang/cl)');
}
