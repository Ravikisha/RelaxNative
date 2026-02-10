import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from 'fs';
import { join } from 'path';
import { createInterface } from 'node:readline';

import { getInstalledPackageDir, getRegistryRoot } from './registryPaths.js';
import { readRelaxJson } from './relaxJson.js';
import { staticScanNativeSource } from './staticScan.js';
import { normalizeTrustLevel, trustPolicy, type TrustLevel } from './trust.js';
import { verifyRegistrySignature } from './signature.js';

type TrustState = {
  trusted: Record<string, { trust: TrustLevel; at: number }>;
};

function trustStatePath(registryRoot: string) {
  return join(registryRoot, '.trust.json');
}

function readTrustState(registryRoot: string): TrustState {
  const p = trustStatePath(registryRoot);
  try {
    if (!existsSync(p)) return { trusted: {} };
    const raw = readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.trusted !== 'object') return { trusted: {} };
    return parsed as TrustState;
  } catch {
    return { trusted: {} };
  }
}

function writeTrustState(registryRoot: string, state: TrustState) {
  const p = trustStatePath(registryRoot);
  writeFileSync(p, JSON.stringify(state, null, 2) + '\n');
}

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function promptYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return await new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const a = String(answer ?? '').trim().toLowerCase();
      resolve(a === 'y' || a === 'yes');
    });
  });
}

function formatPermissions(perms: any): string[] {
  if (!perms) return [];
  const lines: string[] = [];
  const fsRead = perms.fs?.read?.length ? perms.fs.read.join(', ') : null;
  const fsWrite = perms.fs?.write?.length ? perms.fs.write.join(', ') : null;
  if (fsRead) lines.push(`- fs.read: ${fsRead}`);
  if (fsWrite) lines.push(`- fs.write: ${fsWrite}`);
  // Only treat permissions as notable if they're enabling capability.
  if (perms.network?.outbound === true) lines.push('- network.outbound: true');
  if (perms.process?.spawn === true) lines.push('- process.spawn: true');
  return lines;
}

export type InstallResult = {
  pkg: string;
  dir: string;
  warnings: string[];
  trust: TrustLevel;
};

// Initial hosting strategy: GitHub raw tarball via `curl` is intentionally avoided
// because we want deterministic and testable behavior without network.
// So we support:
// - local folder installs: file:<path>
// - bundled examples for tests
export function installPackage(
  pkgSpecifier: string,
  projectRoot: string = process.cwd(),
): InstallResult {
  const warnings: string[] = [];

  const registryRoot = getRegistryRoot(projectRoot);
  mkdirSync(registryRoot, { recursive: true });

  const isFile = pkgSpecifier.startsWith('file:');
  if (!isFile) {
    throw new Error(
      `Only file: installs are supported right now (deterministic, offline). Got: ${pkgSpecifier}`,
    );
  }

  const srcDir = pkgSpecifier.slice('file:'.length);
  const manifest = readRelaxJson(srcDir);

  const trust = normalizeTrustLevel(manifest.trust);
  const policy = trustPolicy(trust);

  // verified packages must pass registry signature verification
  if (trust === 'verified') {
    const sig = verifyRegistrySignature(srcDir, manifest.registrySignature as any);
    if (!sig.ok) {
  throw new Error(`Refusing verified package: signature check failed (${sig.reason})`);
    }
  }

  const destDir = getInstalledPackageDir(manifest.name, projectRoot);
  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });

  // Very small, deterministic copy (no symlinks).
  // Copy relax.json + each export source only.
  writeFileSync(join(destDir, 'relax.json'), readFileSync(join(srcDir, 'relax.json')));

  for (const exp of manifest.exports) {
    const srcPath = join(srcDir, exp.source);
    const dstPath = join(destDir, exp.source);
    mkdirSync(join(dstPath, '..'), { recursive: true });

    if (!existsSync(srcPath)) {
      throw new Error(`Missing export source: ${srcPath}`);
    }

    // static scan warnings
    const findings = staticScanNativeSource(srcPath);
    for (const f of findings) {
      warnings.push(`${exp.source}:${f.line ?? '?'} ${f.rule}: ${f.message}`);
    }

    writeFileSync(dstPath, readFileSync(srcPath));
  }

  return { pkg: manifest.name, dir: destDir, warnings, trust };
}

export type InstallOptions = {
  /** If true, skip interactive prompt (still refuses community unless previously trusted). */
  yes?: boolean;
};

export async function installPackageEnforcingTrust(
  pkgSpecifier: string,
  projectRoot: string = process.cwd(),
  options?: InstallOptions,
): Promise<InstallResult> {
  const registryRoot = getRegistryRoot(projectRoot);
  mkdirSync(registryRoot, { recursive: true });

  if (!pkgSpecifier.startsWith('file:')) {
    throw new Error(
      `Only file: installs are supported right now (deterministic, offline). Got: ${pkgSpecifier}`,
    );
  }

  const srcDir = pkgSpecifier.slice('file:'.length);
  const manifest = readRelaxJson(srcDir);
  const trust = normalizeTrustLevel(manifest.trust);
  const policy = trustPolicy(trust);

  const state = readTrustState(registryRoot);
  const key = `${manifest.name}@${manifest.version}`;
  const known = state.trusted[key];

  const permissionLines = formatPermissions(manifest.permissions);
  const hasElevatedPerms = permissionLines.length > 0;

  if (trust === 'verified') {
    const sig = verifyRegistrySignature(srcDir, manifest.registrySignature as any);
    if (!sig.ok) {
      throw new Error(`Refusing verified package: signature check failed (${sig.reason})`);
    }
  }

  // Community packages need explicit confirmation, but no repeated prompts.
  if (policy.requireConfirm && !known) {
    const lines: string[] = [];
    lines.push(`Installing community package ${manifest.name}@${manifest.version}`);
    lines.push(`Trust: ${trust}`);
    if (hasElevatedPerms) {
      lines.push('Requested permissions:');
      lines.push(...permissionLines);
    } else {
      lines.push('Requested permissions: (none)');
    }
    lines.push('This will compile and run native code on your machine.');

    if (options?.yes) {
      throw new Error('Community package install requires confirmation (re-run without --yes or mark as trusted).');
    }
    if (!isInteractive()) {
      throw new Error('Community package install requires an interactive terminal.');
    }

    // eslint-disable-next-line no-console
    console.warn(lines.join('\n'));
    const ok = await promptYesNo('Proceed? (y/N) ');
    if (!ok) {
      throw new Error('Aborted');
    }

    // record as trusted to avoid repeated prompts
    state.trusted[key] = { trust, at: Date.now() };
    writeTrustState(registryRoot, state);
  }

  // For community trust, reject elevated permissions by default.
  if (!policy.allowPermissions && hasElevatedPerms) {
    throw new Error(
      `Refusing community package with declared permissions. Move to 'local' trust or get it verified.`,
    );
  }

  const res = installPackage(pkgSpecifier, projectRoot);

  // If local/verified, record trust so subsequent installs are silent.
  if (!state.trusted[key]) {
    state.trusted[key] = { trust, at: Date.now() };
    writeTrustState(registryRoot, state);
  }

  // extra UX: warn on install if policy says so
  if (policy.warnOnInstall && res.warnings.length) {
    // eslint-disable-next-line no-console
    console.warn(`\nStatic scan warnings (${res.warnings.length}):`);
  }

  return res;
}

export function removePackage(
  pkg: string,
  projectRoot: string = process.cwd(),
) {
  const destDir = getInstalledPackageDir(pkg, projectRoot);
  rmSync(destDir, { recursive: true, force: true });
}

export function listPackages(projectRoot: string = process.cwd()): string[] {
  const root = getRegistryRoot(projectRoot);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

// keep a tiny deterministic index
export function updateIndex(projectRoot: string = process.cwd()) {
  const root = getRegistryRoot(projectRoot);
  if (!existsSync(root)) return;
  const pkgs = listPackages(projectRoot);
  writeFileSync(join(root, '.index'), pkgs.join('\n') + (pkgs.length ? '\n' : ''));
}
