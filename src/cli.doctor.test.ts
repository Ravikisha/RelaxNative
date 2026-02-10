import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

// Run the built CLI (tests build before running).
function runCli(args: string[]) {
  const out = execFileSync(process.execPath, ['dist/cli.js', ...args], {
    cwd: process.cwd(),
    env: { ...process.env },
    encoding: 'utf8',
  });
  return out;
}

describe('cli doctor', () => {
  it('prints human-readable diagnostics', () => {
    const out = runCli(['doctor']);
    expect(out).toMatch(/\u2713/);
    expect(out).toMatch(/compiler|Cache directory|Worker threads|ESM loader/i);
  });
});
