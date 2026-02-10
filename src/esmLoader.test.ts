import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

function runNodeWithLoader(cwd: string, entry: string) {
  const node = process.execPath;
  const loader = join(process.cwd(), 'dist', 'esmLoader.js');
  return execFileSync(
    node,
    ['--loader', loader, entry],
    { cwd, encoding: 'utf8' },
  );
}

describe('esm loader (native + registry)', () => {
  it('imports a .c file and executes it (cache reused on second run)', async () => {
    // build dist so loader path exists
    execFileSync('npm', ['run', 'build'], { cwd: process.cwd(), stdio: 'inherit' });

    const dir = mkdtempSync(join(tmpdir(), 'relaxnative-loader-'));

    // entry that imports native file directly
    const entry1 = join(dir, 'entry1.mjs');
    writeFileSync(
      entry1,
      `import math from ${JSON.stringify(join(process.cwd(), 'examples', 'add.c'))};\n` +
        `console.log(math.add(2,3));\n`,
    );

    const out1 = runNodeWithLoader(dir, entry1);
    expect(out1.trim()).toBe('5');

    // run again; should hit cache (compileWithCache) deterministically
    const out2 = runNodeWithLoader(dir, entry1);
    expect(out2.trim()).toBe('5');
  }, 120000);

  it('imports relaxnative/<pkg> from native/registry and executes', async () => {
    execFileSync('npm', ['run', 'build'], { cwd: process.cwd(), stdio: 'inherit' });

    const project = mkdtempSync(join(tmpdir(), 'relaxnative-reg-import-'));
    const regDir = join(project, 'native', 'registry', 'fast-matrix');
    mkdirSync(regDir, { recursive: true });

    // copy example registry package in
    writeFileSync(
      join(regDir, 'relax.json'),
      readFileSync(
        join(process.cwd(), 'examples/registry/fast-matrix/relax.json'),
      ),
    );
    writeFileSync(
      join(regDir, 'matrix.c'),
      readFileSync(
        join(process.cwd(), 'examples/registry/fast-matrix/matrix.c'),
      ),
    );

    const entry = join(project, 'entry.mjs');
    writeFileSync(
      entry,
      `import matrix from 'relaxnative/fast-matrix';\n` +
    `console.log(matrix.version());\n`,
    );

    const out = runNodeWithLoader(project, entry);
  expect(out.trim()).toBe('1');
  }, 120000);
});
