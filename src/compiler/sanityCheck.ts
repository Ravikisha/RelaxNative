import { execFileSync } from 'child_process';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import type { CompilerInfo } from './compilerTypes.js';

export function sanityCheckC(compiler: CompilerInfo): void {
  const dir = mkdtempSync(join(tmpdir(), 'relaxnative-'));
  const source = join(dir, 'test.c');
  const output = join(dir, 'test');

  writeFileSync(source, 'int main(){return 0;}');

  try {
    execFileSync(
      compiler.path,
      compiler.vendor === 'msvc'
        ? [source]
        : [source, '-o', output],
      { stdio: 'ignore' },
    );
  } catch (err) {
    throw new Error(
      `C compiler failed sanity check: ${compiler.path}`,
    );
  }
}
