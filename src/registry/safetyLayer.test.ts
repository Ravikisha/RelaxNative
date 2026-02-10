import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { installPackage } from './installer.js';
import { staticScanNativeSource } from './staticScan.js';
import { loadRegistry } from './loadRegistry.js';

describe('native safety layer', () => {
  it('static scan flags risky APIs', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'relaxnative-scan-'));
    const src = join(projectRoot, 'x.c');
    writeFileSync(src, 'int x(){ system("sh"); mprotect(0,0,PROT_EXEC); syscall(1); return 0; }');

    const findings = staticScanNativeSource(src);
    const rules = new Set(findings.map((f) => f.rule));
    expect(rules.has('process-spawn')).toBe(true);
    expect(rules.has('raw-syscall')).toBe(true);
    expect(rules.has('w-x-memory')).toBe(true);
  });

  it('enforces permissions in process isolation helper (blocks fs/network/process)', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'relaxnative-perms-'));

    // install registry pkg with no perms
    installPackage('file:examples/registry/unsafe-perms', projectRoot);

    const mod: any = await loadRegistry('unsafe-perms', projectRoot);
  await expect(mod.noop()).resolves.toBe(1);

    // The enforcement is inside the helper runtime. We simulate an attempt to use forbidden APIs
    // by calling a function that triggers Node module usage inside helper. We do that by asking
    // the helper to execute a JS-side check via a special binding (handled in processEntry).
  await expect((mod as any).__test_forbidden_fs()).rejects.toThrow(/Import denied: (node:)?fs/i);
  await expect((mod as any).__test_forbidden_net()).rejects.toThrow(/Import denied: (node:)?https/i);
  await expect((mod as any).__test_forbidden_spawn()).rejects.toThrow(/Import denied: (node:)?child_process/i);
  }, 30_000);

  it('enforces call timeout by killing helper and rejecting', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'relaxnative-timeout-'));

    // Create an ad-hoc registry package with a long-running native function.
    const pkgDir = join(projectRoot, 'pkg');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, 'relax.json'),
      JSON.stringify(
        {
          name: 'hang',
          version: '0.1.0',
          trust: 'community',
          exports: [{ source: 'hang.c' }],
          permissions: { fs: { read: [], write: [] }, network: { outbound: false }, process: { spawn: false } },
          limits: { timeoutMs: 200 },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(pkgDir, 'hang.c'),
      [
        '// @sync',
        'void hang_ms(int ms) {',
        '  volatile long x = 0;',
        '  for (int i = 0; i < ms * 1000000; i++) x += i;',
        '}',
      ].join('\n'),
    );

    installPackage(`file:${pkgDir}`, projectRoot);
    const mod: any = await loadRegistry('hang', projectRoot);

  await expect(mod.hang_ms(500)).rejects.toThrow(/exceeded timeout/i);
  }, 30_000);
});
