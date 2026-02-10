import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { installPackageEnforcingTrust } from './installer.js';
import { loadRegistry } from './loadRegistry.js';
import { sha256RelaxJsonWithoutSignatureHex } from './signature.js';

function makePkg(dir: string, relaxJson: any, srcName = 'noop.c') {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'relax.json'), JSON.stringify(relaxJson, null, 2));
  writeFileSync(join(dir, srcName), ['// @sync', 'int noop(){ return 1; }'].join('\n'));
}

describe('registry trust levels', () => {
  it('verified packages require a valid signature', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'relaxnative-trust-'));
    const pkgDir = join(projectRoot, 'pkg');

    const base = {
      name: 'verified-one',
      version: '0.1.0',
      trust: 'verified',
      exports: [{ source: 'noop.c' }],
      permissions: { fs: { read: [], write: [] }, network: { outbound: false }, process: { spawn: false } },
    };

    // Missing signature should fail
    makePkg(pkgDir, base);
    await expect(installPackageEnforcingTrust(`file:${pkgDir}`, projectRoot)).rejects.toThrow(/signature/i);

  // Correct signature should pass.
  // Signature is over relax.json content with registrySignature removed.
  const jsonPath = join(pkgDir, 'relax.json');
  const placeholder = { ...base, registrySignature: { alg: 'sha256', digest: '0'.repeat(64) } };
  writeFileSync(jsonPath, JSON.stringify(placeholder, null, 2));
  const digestRes = sha256RelaxJsonWithoutSignatureHex(jsonPath);
  if (!digestRes.ok) throw new Error(digestRes.reason);
  const withSig = { ...base, registrySignature: { alg: 'sha256', digest: digestRes.digest } };
  writeFileSync(jsonPath, JSON.stringify(withSig, null, 2));

    const res = await installPackageEnforcingTrust(`file:${pkgDir}`, projectRoot);
    expect(res.pkg).toBe('verified-one');
    expect(res.trust).toBe('verified');

    // trust state file should be written
    const trustState = readFileSync(join(projectRoot, 'native', 'registry', '.trust.json'), 'utf8');
    expect(trustState).toMatch(/verified-one/);
  });

  it('community packages prompt once and cache trust (non-interactive refuses on first install)', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'relaxnative-trust2-'));
    const pkgDir = join(projectRoot, 'pkg2');

    makePkg(pkgDir, {
      name: 'community-one',
      version: '0.1.0',
      trust: 'community',
      exports: [{ source: 'noop.c' }],
      permissions: { fs: { read: [], write: [] }, network: { outbound: false }, process: { spawn: false } },
    });

    // Simulate non-interactive env: should fail.
    const stdin = process.stdin.isTTY;
    const stdout = process.stdout.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    await expect(installPackageEnforcingTrust(`file:${pkgDir}`, projectRoot)).rejects.toThrow(/interactive/i);

    // restore tty flags
    Object.defineProperty(process.stdin, 'isTTY', { value: stdin, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: stdout, configurable: true });

    // Simulate an accepted prompt by pre-seeding trust state.
    // (We keep installer prompting logic simple; tests don't need to mock readline.)
    const registryRoot = join(projectRoot, 'native', 'registry');
    mkdirSync(registryRoot, { recursive: true });
    writeFileSync(
      join(registryRoot, '.trust.json'),
      JSON.stringify({ trusted: { 'community-one@0.1.0': { trust: 'community', at: Date.now() } } }, null, 2),
    );

    const res1 = await installPackageEnforcingTrust(`file:${pkgDir}`, projectRoot);
    expect(res1.trust).toBe('community');

    // Second time should not prompt; we ensure it works even with non-interactive
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

  const res2 = await installPackageEnforcingTrust(`file:${pkgDir}`, projectRoot);
    expect(res2.pkg).toBe('community-one');

    // restore tty flags
    Object.defineProperty(process.stdin, 'isTTY', { value: stdin, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: stdout, configurable: true });
  });

  it('community trust defaults to async execution mode when not specified', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'relaxnative-trust3-'));
    const pkgDir = join(projectRoot, 'pkg3');

    makePkg(pkgDir, {
      name: 'community-async-default',
      version: '0.1.0',
      trust: 'community',
      exports: [{ source: 'noop.c' }],
  // no explicit permissions
      // no functionMode defined
    });

    // Install trust without prompt by pre-seeding the trust state (simulate previously trusted)
    const registryRoot = join(projectRoot, 'native', 'registry');
    mkdirSync(registryRoot, { recursive: true });
    writeFileSync(
      join(registryRoot, '.trust.json'),
      JSON.stringify({ trusted: { 'community-async-default@0.1.0': { trust: 'community', at: Date.now() } } }, null, 2),
    );

    await installPackageEnforcingTrust(`file:${pkgDir}`, projectRoot);

    const mod: any = await loadRegistry('community-async-default', projectRoot);
    // Because default execution mode is async for community, call should return a Promise.
    const v = mod.noop();
    expect(typeof (v as any)?.then).toBe('function');
    await expect(v).resolves.toBe(1);
  }, 30_000);
});
